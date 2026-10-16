import {
  type Abi,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  stringToHex,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import { cleanLabel, readAssetInfo } from "./assets.js";
import { memoryCache, type ScanCache } from "./cache.js";
import type { ChainReader } from "./state.js";

const USDC = "0x1111111111111111111111111111111111111111";
const MKR = "0x2222222222222222222222222222222222222222";
const NFT = "0x3333333333333333333333333333333333333333";
const BARE = "0x4444444444444444444444444444444444444444";

interface Call {
  address: string;
  abi: Abi;
  functionName: string;
}

const reverted = (call: Call) =>
  new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({ abi: call.abi, functionName: call.functionName }),
    { abi: call.abi, functionName: call.functionName },
  );

const returnsBytes32 = (call: Call) =>
  call.abi.some((item) => item.type === "function" && item.outputs[0]?.type === "bytes32");

/** Answers like a real chain: USDC is standard, MKR uses bytes32, the NFT has no decimals. */
function answer(call: Call): unknown {
  const bytes32 = returnsBytes32(call);
  switch (`${call.address}:${call.functionName}`) {
    case `${USDC}:name`:
      return bytes32 ? reverted(call) : "USD Coin";
    case `${USDC}:symbol`:
      return bytes32 ? reverted(call) : "USDC";
    case `${USDC}:decimals`:
      return 6;
    case `${MKR}:name`:
      return bytes32 ? stringToHex("Maker", { size: 32 }) : reverted(call);
    case `${MKR}:symbol`:
      return bytes32 ? stringToHex("MKR", { size: 32 }) : reverted(call);
    case `${MKR}:decimals`:
      return 18;
    case `${NFT}:name`:
      return bytes32 ? reverted(call) : "Bored Ape Yacht Club";
    case `${NFT}:symbol`:
      return bytes32 ? reverted(call) : "BAYC";
    default:
      return reverted(call);
  }
}

/** A client whose multicall uses `respond`; an Error result becomes a per-call failure. */
function fakeClient(respond: (call: Call) => unknown = answer) {
  const multicall = vi.fn(async ({ contracts }: { contracts: Call[] }) =>
    contracts.map((call) => {
      const result = respond(call);
      return result instanceof Error
        ? { status: "failure", error: result }
        : { status: "success", result };
    }),
  );
  return { client: { multicall } as unknown as ChainReader, multicall };
}

describe("readAssetInfo", () => {
  it("reads names, symbols and decimals, including bytes32 ones", async () => {
    const { client } = fakeClient();
    const info = await readAssetInfo(client, 1, [USDC, MKR, NFT, BARE, USDC]);
    expect(Object.fromEntries(info)).toEqual({
      [USDC]: { name: "USD Coin", symbol: "USDC", decimals: 6 },
      [MKR]: { name: "Maker", symbol: "MKR", decimals: 18 },
      [NFT]: { name: "Bored Ape Yacht Club", symbol: "BAYC" },
      [BARE]: {},
    });
  });

  it("caches answers, including a contract that has none", async () => {
    const { client, multicall } = fakeClient();
    const cache = memoryCache();
    await readAssetInfo(client, 1, [USDC, BARE], cache);
    multicall.mockClear();

    const info = await readAssetInfo(client, 1, [USDC, BARE], cache);
    expect(multicall).not.toHaveBeenCalled();
    expect(info.get(USDC)?.symbol).toBe("USDC");
    expect(info.get(BARE)).toEqual({});
  });

  it("does not cache a request that failed, and never fails the scan", async () => {
    const down = new HttpRequestError({ url: "https://rpc.example" });
    const { client } = fakeClient(() => down);
    const cache = memoryCache();

    const info = await readAssetInfo(client, 1, [USDC], cache);
    expect(info.get(USDC)).toEqual({});
    expect((await cache.getAssetInfo(1, [USDC])).size).toBe(0);
  });

  it("still answers when the client throws or the cache fails", async () => {
    const client = {
      multicall: async () => {
        throw new Error("boom");
      },
    } as unknown as ChainReader;
    const broken: ScanCache = {
      ...memoryCache(),
      getAssetInfo: () => Promise.reject(new Error("db down")),
    };
    const onCacheError = vi.fn();
    const info = await readAssetInfo(client, 1, [USDC], broken, onCacheError);
    expect(info.size).toBe(0);
    expect(onCacheError).toHaveBeenCalledOnce();
  });

  it("drops labels that could mislead and decimals that make no sense", async () => {
    const { client } = fakeClient((call) => {
      if (call.functionName === "decimals") return 255;
      return call.functionName === "name" ? "Claim your reward at usdc-gift.com" : "USDC‮";
    });
    const info = await readAssetInfo(client, 1, [BARE]);
    expect(info.get(BARE)).toEqual({ symbol: "USDC" });
  });
});

describe("cleanLabel", () => {
  it("keeps plain names and tidies whitespace", () => {
    expect(cleanLabel("  Wrapped   Ether ", 48)).toBe("Wrapped Ether");
    expect(cleanLabel("USD₮0", 16)).toBe("USD₮0");
    expect(cleanLabel("BTC.b", 16)).toBe("BTC.b");
  });

  it("removes invisible and direction-changing characters", () => {
    expect(cleanLabel("US​DC", 16)).toBe("USDC");
    expect(cleanLabel("Maker\0\0\0", 48)).toBe("Maker");
    expect(cleanLabel("‮CDSU", 16)).toBe("CDSU");
  });

  it("rejects links, long text, empty text and non-strings", () => {
    expect(cleanLabel("Visit https://claim.example", 48)).toBeUndefined();
    expect(cleanLabel("www.airdrop", 48)).toBeUndefined();
    expect(cleanLabel("t.me/freetokens", 48)).toBeUndefined();
    expect(cleanLabel("A".repeat(17), 16)).toBeUndefined();
    expect(cleanLabel("​ ", 16)).toBeUndefined();
    expect(cleanLabel(42, 16)).toBeUndefined();
  });
});
