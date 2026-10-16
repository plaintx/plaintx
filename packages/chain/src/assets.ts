import type { Address } from "@plaintx/core";
import { ContractFunctionExecutionError, hexToString, parseAbi } from "viem";
import type { ScanCache } from "./cache.js";
import type { ChainReader } from "./state.js";

/**
 * How a token or NFT collection names itself, for display only. Every field is optional: many
 * contracts leave some out. These come from the contract itself, so a scam token can claim any
 * name: they never feed into a verdict. See ADR 0011.
 */
export interface AssetInfo {
  name?: string;
  symbol?: string;
  /** ERC-20 only: how many decimal places the raw amounts have. */
  decimals?: number;
}

const stringAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
// Some early tokens (MKR, SAI) return their name and symbol as bytes32.
const bytes32Abi = parseAbi([
  "function name() view returns (bytes32)",
  "function symbol() view returns (bytes32)",
]);

const FIELDS = ["name", "symbol", "decimals"] as const;
type Field = (typeof FIELDS)[number];

/** Calls per Multicall3 request, as in state.ts. */
const MULTICALL_SIZE = 500;

/** Longer values are dropped rather than cut, since a cut-off name can still mislead. */
const MAX_SYMBOL = 16;
const MAX_NAME = 48;
/** No real token has more; larger values would make amounts unreadable. */
const MAX_DECIMALS = 36;

/**
 * Reads the name, symbol and decimals of each asset. A contract that does not answer simply
 * has no info: missing names only change what the user sees, so unlike allowances, failures
 * here never fail the scan. Answers are cached; a request that did not get through is not.
 */
export async function readAssetInfo(
  client: ChainReader,
  chainId: number,
  assets: readonly Address[],
  cache?: ScanCache,
  onCacheError: (error: unknown) => void = () => {},
): Promise<Map<Address, AssetInfo>> {
  const unique = [...new Set(assets)];
  const info = cache
    ? await cache.getAssetInfo(chainId, unique).catch((error) => {
        onCacheError(error);
        return new Map<Address, AssetInfo>();
      })
    : new Map<Address, AssetInfo>();

  const missing = unique.filter((a) => !info.has(a));
  const fetched = new Map<Address, AssetInfo>();
  for (let i = 0; i < missing.length; i += MULTICALL_SIZE) {
    const group = missing.slice(i, i + MULTICALL_SIZE);
    const reads = await readGroup(client, group).catch(() => new Map<Address, AssetRead>());
    for (const [address, read] of reads) {
      info.set(address, read.info);
      if (read.final) fetched.set(address, read.info);
    }
  }
  if (cache && fetched.size > 0) await cache.putAssetInfo(chainId, fetched).catch(onCacheError);
  return info;
}

/** `final`: every field got a definite answer, so the info is worth caching. */
type AssetRead = { info: AssetInfo; final: boolean };

async function readGroup(
  client: ChainReader,
  group: readonly Address[],
): Promise<Map<Address, AssetRead>> {
  const calls = group.flatMap((address) =>
    FIELDS.map((functionName) => ({ address, abi: stringAbi, functionName }) as const),
  );
  const results = await client.multicall({ contracts: calls, allowFailure: true, batchSize: 0 });

  const read = new Map<Address, AssetRead>();
  const retry: { address: Address; functionName: "name" | "symbol" }[] = [];
  for (const [i, address] of group.entries()) {
    const info: AssetInfo = {};
    let final = true;
    for (const [j, field] of FIELDS.entries()) {
      const r = results[i * FIELDS.length + j];
      if (r?.status === "success") setField(info, field, r.result);
      else if (!answered(r?.error)) final = false;
      else if (field !== "decimals") retry.push({ address, functionName: field });
    }
    read.set(address, { info, final });
  }

  if (retry.length > 0) {
    const results = await client.multicall({
      contracts: retry.map((c) => ({ ...c, abi: bytes32Abi })),
      allowFailure: true,
      batchSize: 0,
    });
    for (const [i, { address, functionName }] of retry.entries()) {
      const entry = read.get(address);
      const r = results[i];
      if (!entry || !r) continue;
      if (r.status === "success")
        setField(entry.info, functionName, hexToString(r.result as `0x${string}`, { size: 32 }));
      else if (!answered(r.error)) entry.final = false;
    }
  }
  return read;
}

/**
 * True if the contract itself answered (it reverted, returned nothing or returned something
 * undecodable), so asking again would give the same result. Viem wraps those per call;
 * a network or provider error fails the whole request and arrives unwrapped.
 */
function answered(error: unknown): boolean {
  return error instanceof ContractFunctionExecutionError;
}

function setField(info: AssetInfo, field: Field, value: unknown): void {
  if (field === "decimals") {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_DECIMALS)
      info.decimals = value;
    return;
  }
  const text = cleanLabel(value, field === "symbol" ? MAX_SYMBOL : MAX_NAME);
  if (text) info[field] = text;
}

// Control characters, zero-width and bidi-override characters, and line/paragraph separators:
// they can hide or reorder text.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
// Scam tokens use their name to advertise a phishing site ("Claim at usdc-airdrop.com").
const LINK = /https?:|www\.|[a-z0-9-]\.[a-z]{2,}(?![a-z])/i;

/**
 * Makes a contract-supplied label fit to show. Returns undefined for anything that is not a
 * short, plain piece of text, so the app falls back to the address.
 */
export function cleanLabel(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  if (!text || text.length > maxLength || LINK.test(text)) return undefined;
  return text;
}
