import { pad, toEventSelector } from "viem";
import { describe, expect, it, vi } from "vitest";
import { findCandidates, PERMIT2 } from "./discovery.js";
import { type Etherscan, type EtherscanLog, type LogQuery, PAGE_SIZE } from "./etherscan.js";

const OWNER = "0x00000000000000000000000000000000000000AA";
const TOKEN = "0x1111111111111111111111111111111111111111";
const NFT = "0x2222222222222222222222222222222222222222";
const SPENDER = "0x3333333333333333333333333333333333333333";

const APPROVAL = toEventSelector("Approval(address,address,uint256)");
const APPROVAL_FOR_ALL = toEventSelector("ApprovalForAll(address,address,bool)");
const PERMIT2_APPROVAL = toEventSelector("Approval(address,address,address,uint160,uint48)");

const topic = (a: `0x${string}`) => pad(a).toLowerCase() as `0x${string}`;
const log = (address: `0x${string}`, topics: `0x${string}`[], block = 1): EtherscanLog => ({
  address,
  topics,
  data: "0x",
  blockNumber: `0x${block.toString(16)}`,
});

/** Serves logs by topic0, honouring fromBlock and the page size like Etherscan does. */
function fakeEtherscan(logs: Record<string, EtherscanLog[]>) {
  const getLogs = vi.fn(async (q: LogQuery) =>
    (logs[q.topic0] ?? []).filter((l) => Number(l.blockNumber) >= q.fromBlock).slice(0, PAGE_SIZE),
  );
  const etherscan: Etherscan = { getLogs, isVerified: async () => true };
  return { etherscan, getLogs };
}

describe("findCandidates", () => {
  it("turns ERC-20, NFT and Permit2 approval logs into candidates", async () => {
    const { etherscan, getLogs } = fakeEtherscan({
      [APPROVAL]: [log(TOKEN, [APPROVAL, topic(OWNER), topic(SPENDER)])],
      [APPROVAL_FOR_ALL]: [log(NFT, [APPROVAL_FOR_ALL, topic(OWNER), topic(SPENDER)])],
      [PERMIT2_APPROVAL]: [
        log(PERMIT2, [PERMIT2_APPROVAL, topic(OWNER), topic(TOKEN), topic(SPENDER)]),
      ],
    });

    expect(await findCandidates(etherscan, 1, OWNER)).toEqual([
      { kind: "erc20", token: TOKEN, spender: SPENDER },
      { kind: "nft-all", collection: NFT, spender: SPENDER },
      { kind: "permit2", token: TOKEN, spender: SPENDER },
    ]);
    expect(getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ topic0: APPROVAL, topic1: topic(OWNER), fromBlock: 0 }),
    );
    expect(getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ topic0: PERMIT2_APPROVAL, address: PERMIT2 }),
    );
  });

  it("skips single-token ERC-721 approvals and dedupes repeated approvals", async () => {
    const { etherscan } = fakeEtherscan({
      [APPROVAL]: [
        log(TOKEN, [APPROVAL, topic(OWNER), topic(SPENDER)], 1),
        log(TOKEN, [APPROVAL, topic(OWNER), topic(SPENDER)], 2),
        log(NFT, [APPROVAL, topic(OWNER), topic(SPENDER), pad("0x01")], 3),
      ],
    });
    expect(await findCandidates(etherscan, 1, OWNER)).toEqual([
      { kind: "erc20", token: TOKEN, spender: SPENDER },
    ]);
  });

  it("pages forward by block number when a page is full", async () => {
    const tokens = Array.from(
      { length: PAGE_SIZE + 5 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}` as const,
    );
    const { etherscan, getLogs } = fakeEtherscan({
      [APPROVAL]: tokens.map((t, i) => log(t, [APPROVAL, topic(OWNER), topic(SPENDER)], i + 1)),
    });

    const candidates = await findCandidates(etherscan, 1, OWNER);
    expect(candidates).toHaveLength(PAGE_SIZE + 5);
    const approvalCalls = getLogs.mock.calls.filter(([q]) => q.topic0 === APPROVAL);
    expect(approvalCalls.map(([q]) => q.fromBlock)).toEqual([0, PAGE_SIZE]);
  });
});
