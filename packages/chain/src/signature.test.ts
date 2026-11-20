import { decodeSignature, MAX_CHECKED_PARTIES, PERMIT2, parseTypedData } from "@plaintx/core";
import type { Blocklist } from "@plaintx/registry";
import { describe, expect, it, vi } from "vitest";
import type { Etherscan } from "./etherscan.js";
import { checkSignature } from "./signature.js";
import type { ChainReader } from "./state.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const DRAINER = "0x4444444444444444444444444444444444444444";
// Uniswap Universal Router 2.0 on Ethereum, a registry entry.
const ROUTER = "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af";
const NOW = 1_763_500_000;
const OFFER_ITEM = [
  { name: "itemType", type: "uint8" },
  { name: "token", type: "address" },
  { name: "identifierOrCriteria", type: "uint256" },
  { name: "startAmount", type: "uint256" },
  { name: "endAmount", type: "uint256" },
];

function permit2(spender: string, chainId = 1) {
  return decodeSignature(
    parseTypedData(
      JSON.stringify({
        types: {
          PermitSingle: [
            { name: "details", type: "PermitDetails" },
            { name: "spender", type: "address" },
            { name: "sigDeadline", type: "uint256" },
          ],
          PermitDetails: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint160" },
            { name: "expiration", type: "uint48" },
            { name: "nonce", type: "uint48" },
          ],
        },
        primaryType: "PermitSingle",
        domain: { name: "Permit2", chainId, verifyingContract: PERMIT2 },
        message: {
          details: { token: TOKEN, amount: "1000000", expiration: NOW + 3600, nonce: 0 },
          spender,
          sigDeadline: NOW + 1800,
        },
      }),
    ),
  );
}

/** Contracts at `contracts` have code; token calls answer as USDC would. */
function fakeClient(contracts: string[]): ChainReader {
  const answer = (functionName: string) =>
    ({ name: "USD Coin", symbol: "USDC", decimals: 6 })[functionName];
  return {
    readContract: async ({ functionName }: { functionName: string }) => answer(functionName),
    multicall: async ({ contracts: calls }: { contracts: { functionName: string }[] }) =>
      calls.map((c) => ({ status: "success", result: answer(c.functionName) })),
    getCode: async ({ address }: { address: string }) =>
      contracts.includes(address) ? "0x6080" : undefined,
    getStorageAt: async () => undefined,
  } as unknown as ChainReader;
}

const etherscan: Etherscan = { getLogs: async () => [], isVerified: async () => true };

describe("checkSignature", () => {
  it("checks every party and reads the token's details", async () => {
    const report = await checkSignature({
      request: permit2(ROUTER),
      client: fakeClient([ROUTER, PERMIT2, TOKEN]),
      etherscan,
      now: NOW,
    });
    expect(report.verdict).toEqual({ level: "no_known_risks", findings: [] });
    expect(report.parties).toMatchObject([
      { address: ROUTER, role: "spender", info: { reputation: "known" } },
      { address: PERMIT2, role: "contract", info: { reputation: "known", name: "Permit2" } },
    ]);
    expect(report.assets.get(TOKEN)).toEqual({ name: "USD Coin", symbol: "USDC", decimals: 6 });
  });

  it("finds a spender on a scam list", async () => {
    const blocklist: Blocklist = {
      check: async (_chain, address) =>
        address === DRAINER
          ? { status: "listed", matches: [{ source: "Test list", note: "drainer" }] }
          : { status: "not-listed" },
    };
    const report = await checkSignature({
      request: permit2(DRAINER),
      client: fakeClient([PERMIT2, TOKEN]),
      etherscan,
      now: NOW,
      blocklist,
    });
    expect(report.verdict.level).toBe("danger");
    expect(report.verdict.findings.map((f) => f.id)).toEqual([
      "malicious-spender",
      "spender-is-wallet",
    ]);
    expect(report.parties[0]?.info?.listedBy).toEqual(["Test list: drainer"]);
  });

  it("reads nothing when the chain cannot be read, and says the result is incomplete", async () => {
    const report = await checkSignature({
      request: permit2(ROUTER, 10),
      client: null,
      etherscan,
      now: NOW,
    });
    expect(report.verdict.findings.map((f) => f.id)).toEqual(["unchecked-network"]);
    expect(report.parties.every((p) => !p.info)).toBe(true);
  });

  it("looks up at most MAX_CHECKED_PARTIES addresses, and says some went unchecked", async () => {
    const recipients = Array.from(
      { length: 30 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`,
    );
    const item = { itemType: 0, token: `0x${"0".repeat(40)}`, identifierOrCriteria: 0 };
    const request = decodeSignature(
      parseTypedData(
        JSON.stringify({
          types: {
            OrderComponents: [
              ["offerer", "address"],
              ["zone", "address"],
              ["offer", "OfferItem[]"],
              ["consideration", "ConsiderationItem[]"],
              ["orderType", "uint8"],
              ["startTime", "uint256"],
              ["endTime", "uint256"],
              ["zoneHash", "bytes32"],
              ["salt", "uint256"],
              ["conduitKey", "bytes32"],
              ["counter", "uint256"],
            ].map(([name, type]) => ({ name, type })),
            OfferItem: OFFER_ITEM,
            ConsiderationItem: [...OFFER_ITEM, { name: "recipient", type: "address" }],
          },
          primaryType: "OrderComponents",
          domain: { name: "Seaport", chainId: 1, verifyingContract: TOKEN },
          message: {
            offerer: DRAINER,
            zone: `0x${"0".repeat(40)}`,
            offer: [],
            consideration: recipients.map((recipient) => ({
              ...item,
              startAmount: 1,
              endAmount: 1,
              recipient,
            })),
            orderType: 0,
            startTime: 0,
            endTime: NOW,
            zoneHash: `0x${"0".repeat(64)}`,
            salt: 0,
            conduitKey: `0x${"0".repeat(64)}`,
            counter: 0,
          },
        }),
      ),
    );
    const client = fakeClient([TOKEN]);
    const getCode = vi.spyOn(client, "getCode");
    const report = await checkSignature({ request, client, etherscan, now: NOW });
    expect(getCode).toHaveBeenCalledTimes(MAX_CHECKED_PARTIES);
    expect(report.verdict.findings.map((f) => f.id)).toContain("unchecked-addresses");
  });
});
