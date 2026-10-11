import { BLOCKLIST_ENTRIES, type Blocklist } from "@plaintx/registry";
import { ContractFunctionRevertedError, HttpRequestError, pad, toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import type { Candidate } from "./discovery.js";
import type { Etherscan } from "./etherscan.js";
import { scanWallet } from "./scan.js";
import { type ChainReader, readActiveApprovals, readSpenderInfo } from "./state.js";

const OWNER = "0x00000000000000000000000000000000000000AA";
const TOKEN = "0x1111111111111111111111111111111111111111";
const NFT = "0x2222222222222222222222222222222222222222";
const APP = "0x3333333333333333333333333333333333333333";
const WALLET = "0x4444444444444444444444444444444444444444";
const NOW = 1_800_000_000;
const MAX = 2n ** 256n - 1n;

interface Read {
  functionName: string;
  args: readonly string[];
}

/** `read` answers contract calls; throwing simulates a revert. `code` maps address -> bytecode. */
function fakeClient(
  read: (call: Read) => unknown,
  code: Record<string, `0x${string}`> = {},
): ChainReader {
  return {
    readContract: async (call: Read) => read(call),
    getCode: async ({ address }: { address: string }) => code[address],
    getStorageAt: async () => undefined, // no proxies here; see upgradeability.test.ts
  } as unknown as ChainReader;
}

const etherscan = (verified: boolean | Error): Etherscan => ({
  getLogs: async () => [],
  isVerified: async () => {
    if (verified instanceof Error) throw verified;
    return verified;
  },
});

describe("readActiveApprovals", () => {
  const candidates: Candidate[] = [
    { kind: "erc20", token: TOKEN, spender: APP },
    { kind: "erc20", token: TOKEN, spender: WALLET },
    { kind: "nft-all", collection: NFT, spender: APP },
    { kind: "permit2", token: TOKEN, spender: APP },
  ];

  it("keeps approvals that still grant something and drops revoked ones", async () => {
    const client = fakeClient(({ functionName, args }) => {
      if (functionName === "isApprovedForAll") return true;
      if (args.length === 3) return [MAX, NOW + 60, 0]; // Permit2 allowance
      return args[1] === APP ? 5n : 0n; // ERC-20 allowance; WALLET was revoked
    });

    expect(await readActiveApprovals(client, 1, OWNER, candidates)).toEqual([
      { kind: "erc20", chainId: 1, token: TOKEN, spender: APP, amount: 5n },
      { kind: "nft-all", chainId: 1, collection: NFT, spender: APP },
      {
        kind: "permit2",
        chainId: 1,
        token: TOKEN,
        spender: APP,
        amount: MAX,
        expiration: NOW + 60,
      },
    ]);
  });

  it("skips tokens whose calls revert", async () => {
    const client = fakeClient(() => {
      throw new ContractFunctionRevertedError({ abi: [], functionName: "allowance" });
    });
    expect(await readActiveApprovals(client, 1, OWNER, candidates)).toEqual([]);
  });

  it("fails instead of dropping approvals when the RPC errors", async () => {
    const client = fakeClient(() => {
      throw new HttpRequestError({ url: "https://rpc.example", status: 429 });
    });
    await expect(readActiveApprovals(client, 1, OWNER, candidates)).rejects.toThrow();
  });
});

describe("readSpenderInfo", () => {
  it("tells contracts from personal wallets, including EIP-7702 delegated wallets", async () => {
    const delegated = "0x5555555555555555555555555555555555555555";
    const client = fakeClient(() => 0n, {
      [APP]: "0x6080",
      [delegated]: `0xef0100${"ab".repeat(20)}`,
    });

    const info = await readSpenderInfo(client, etherscan(true), 1, [APP, WALLET, delegated, APP]);
    expect(info.get(APP)).toEqual({
      reputation: "unknown",
      isContract: true,
      verified: true,
      upgradeability: { proxy: "none" },
    });
    expect(info.get(WALLET)?.isContract).toBe(false);
    expect(info.get(delegated)?.isContract).toBe(false);
    expect(info.size).toBe(3);
  });

  it("marks registry contracts as known, with their name and status", async () => {
    const router = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // Uniswap V2 Router 02 on Ethereum
    const client = fakeClient(() => 0n, { [router]: "0x6080" });
    const info = await readSpenderInfo(client, etherscan(true), 1, [router]);
    expect(info.get(router)).toEqual({
      reputation: "known",
      isContract: true,
      verified: true,
      name: "Uniswap V2 Router 02",
      status: "active",
      upgradeability: { proxy: "none" },
    });
  });

  it("does not trust a registry address that has no code on this chain", async () => {
    const router = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    const info = await readSpenderInfo(
      fakeClient(() => 0n),
      etherscan(true),
      1,
      [router],
    );
    expect(info.get(router)?.reputation).toBe("unknown");
  });

  describe("scam lists", () => {
    const listed = (address: string): Blocklist => ({
      check: async (_, a) =>
        a === address
          ? { status: "listed", matches: [{ source: "Test list", note: "Drainer" }] }
          : { status: "not-listed" },
    });

    it("marks a listed personal wallet as malicious, with the list it came from", async () => {
      const info = await readSpenderInfo(
        fakeClient(() => 0n),
        etherscan(true),
        1,
        [WALLET],
        listed(WALLET),
      );
      expect(info.get(WALLET)).toMatchObject({
        reputation: "malicious",
        isContract: false,
        listedBy: ["Test list: Drainer"],
      });
    });

    it("lets a scam listing override the known-app registry", async () => {
      const router = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
      const client = fakeClient(() => 0n, { [router]: "0x6080" });
      const info = await readSpenderInfo(client, etherscan(true), 1, [router], listed(router));
      expect(info.get(router)).toMatchObject({
        reputation: "malicious",
        name: "Uniswap V2 Router 02",
      });
    });

    it.each<[string, Blocklist]>([
      ["unavailable", { check: async () => ({ status: "unavailable" }) }],
      ["throws", { check: async () => Promise.reject(new Error("timeout")) }],
    ])(
      "flags the spender when the list is %s, never treating it as clean",
      async (_, blocklist) => {
        const info = await readSpenderInfo(
          fakeClient(() => 0n),
          etherscan(true),
          1,
          [WALLET],
          blocklist,
        );
        expect(info.get(WALLET)?.blocklistUnavailable).toBe(true);
      },
    );

    it("uses the bundled lists by default", async () => {
      const [entry] = BLOCKLIST_ENTRIES;
      const address = entry?.[0] as `0x${string}`;
      const info = await readSpenderInfo(
        fakeClient(() => 0n),
        etherscan(true),
        1,
        [address],
      );
      expect(info.get(address)?.reputation).toBe("malicious");
    });
  });

  it("marks verification unknown when Etherscan cannot answer", async () => {
    const client = fakeClient(() => 0n, { [APP]: "0x6080" });
    const info = await readSpenderInfo(client, etherscan(new Error("not on free tier")), 1, [APP]);
    expect(info.get(APP)?.verified).toBe("unknown");
  });
});

describe("scanWallet", () => {
  it("returns active approvals ranked riskiest first", async () => {
    const APPROVAL = toEventSelector("Approval(address,address,uint256)");
    const approvalLog = (token: `0x${string}`, spender: `0x${string}`) => ({
      address: token,
      topics: [APPROVAL, pad(OWNER), pad(spender)],
      data: "0x" as const,
      blockNumber: "0x1" as const,
    });
    const source: Etherscan = {
      ...etherscan(true),
      getLogs: async ({ topic0 }) =>
        topic0 === APPROVAL ? [approvalLog(TOKEN, APP), approvalLog(NFT, WALLET)] : [],
    };
    const client = fakeClient(() => MAX, { [APP]: "0x6080" });

    const ranked = await scanWallet({
      owner: OWNER,
      chainId: 1,
      client,
      etherscan: source,
      now: NOW,
    });
    expect(ranked.map((r) => [r.approval.spender, r.verdict.level])).toEqual([
      [WALLET, "danger"], // personal wallet
      [APP, "caution"], // unlimited, unknown reputation
    ]);
  });
});
