import "server-only";
import { postgresCache } from "@plaintx/cache";
import {
  type ChainName,
  chains,
  createClient,
  createEtherscan,
  type ScanCache,
  type ScanProgress,
  scanWallet,
  UnsupportedChainError,
} from "@plaintx/chain";
import type { Address } from "@plaintx/core";
import { BusyError } from "@plaintx/limits";
import postgres from "postgres";
import { BaseError } from "viem";
import { etherscanThrottle } from "./limits";
import { toRow } from "./rows";
import type { ScanResult } from "./types";

// One pool per server process. Next.js dev reloads modules, so keep it on globalThis.
const globals = globalThis as { plaintxCache?: ScanCache | null };

/** The shared Postgres cache, or null when DATABASE_URL is not set. See ADR 0010. */
function scanCache(): ScanCache | null {
  if (globals.plaintxCache === undefined) {
    const url = process.env.DATABASE_URL;
    globals.plaintxCache = url
      ? postgresCache(postgres(url, { max: 10, connect_timeout: 5, onnotice: () => {} }))
      : null;
  }
  return globals.plaintxCache;
}

/**
 * Runs a wallet scan with the server's API keys. Keys and provider URLs never leave the
 * server: errors are reduced to a redacted message.
 */
export async function runScan(
  owner: Address,
  chainName: ChainName,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanResult> {
  const { chain, rpcEnv } = chains[chainName];
  const rpcUrl = process.env[rpcEnv];
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!rpcUrl || !apiKey) throw new Error(`Server is missing ${rpcEnv} or ETHERSCAN_API_KEY`);

  try {
    const { approvals, assets } = await scanWallet({
      owner,
      chainId: chain.id,
      client: createClient(chainName, rpcUrl),
      etherscan: createEtherscan({ apiKey, throttle: etherscanThrottle(apiKey) }),
      now: Math.floor(Date.now() / 1000),
      ...cacheOptions(),
      ...(onProgress ? { onProgress } : {}),
    });
    return {
      owner,
      chainId: chain.id,
      chainName: chain.name,
      scannedAt: new Date().toISOString(),
      rows: approvals.map((a) => toRow(a, assets)),
    };
  } catch (error) {
    if (error instanceof UnsupportedChainError || error instanceof BusyError) throw error;
    const message = error instanceof BaseError ? error.shortMessage : String(error);
    throw new Error(
      message
        .replaceAll(rpcUrl, "<redacted>")
        .replaceAll(apiKey, "<redacted>")
        .replace(/https?:\/\/\S+/g, "<URL>"),
    );
  }
}

/** A failing cache only slows scans down, so it is logged rather than shown to the user. */
function cacheOptions() {
  const cache = scanCache();
  if (!cache) return {};
  const url = process.env.DATABASE_URL as string;
  return {
    cache,
    onCacheError: (error: unknown) =>
      console.warn("Scan cache unavailable:", String(error).replaceAll(url, "<DATABASE_URL>")),
  };
}
