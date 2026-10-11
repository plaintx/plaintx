import "server-only";
import {
  type ChainName,
  chains,
  createClient,
  createEtherscan,
  scanWallet,
  UnsupportedChainError,
} from "@plaintx/chain";
import type { Address } from "@plaintx/core";
import { BaseError } from "viem";
import { toRow } from "./rows";
import type { ScanResult } from "./types";

/**
 * Runs a wallet scan with the server's API keys. Keys and provider URLs never leave the
 * server: errors are reduced to a redacted message.
 */
export async function runScan(owner: Address, chainName: ChainName): Promise<ScanResult> {
  const { chain, rpcEnv } = chains[chainName];
  const rpcUrl = process.env[rpcEnv];
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!rpcUrl || !apiKey) throw new Error(`Server is missing ${rpcEnv} or ETHERSCAN_API_KEY`);

  try {
    const ranked = await scanWallet({
      owner,
      chainId: chain.id,
      client: createClient(chainName, rpcUrl),
      etherscan: createEtherscan({ apiKey }),
      now: Math.floor(Date.now() / 1000),
    });
    return {
      owner,
      chainId: chain.id,
      chainName: chain.name,
      scannedAt: new Date().toISOString(),
      rows: ranked.map(toRow),
    };
  } catch (error) {
    if (error instanceof UnsupportedChainError) throw error;
    const message = error instanceof BaseError ? error.shortMessage : String(error);
    throw new Error(
      message
        .replaceAll(rpcUrl, "<redacted>")
        .replaceAll(apiKey, "<redacted>")
        .replace(/https?:\/\/\S+/g, "<URL>"),
    );
  }
}
