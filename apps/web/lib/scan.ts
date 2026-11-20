import "server-only";
import {
  type ChainName,
  chains,
  createClient,
  createEtherscan,
  type ScanProgress,
  scanWallet,
  UnsupportedChainError,
} from "@plaintx/chain";
import type { Address } from "@plaintx/core";
import { BusyError } from "@plaintx/limits";
import { BaseError } from "viem";
import { riskBlocklist } from "./blocklist";
import { cacheOptions } from "./cache";
import { etherscanThrottle } from "./limits";
import { toRow } from "./rows";
import type { ScanResult } from "./types";

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
      blocklist: riskBlocklist(),
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
