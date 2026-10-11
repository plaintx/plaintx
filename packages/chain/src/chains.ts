import { createPublicClient, http } from "viem";
import { arbitrum, base, mainnet } from "viem/chains";
import type { ChainReader } from "./state.js";

/** Supported chains for the developer CLIs, with the .env variable holding each RPC URL. */
export const chains = {
  ethereum: { chain: mainnet, rpcEnv: "ETH_RPC_URL" },
  base: { chain: base, rpcEnv: "BASE_RPC_URL" },
  arbitrum: { chain: arbitrum, rpcEnv: "ARBITRUM_RPC_URL" },
} as const;

export type ChainName = keyof typeof chains;

// Small batches and patient retries keep free-tier endpoints from rejecting us (HTTP 429).
export function createClient(name: ChainName, rpcUrl: string): ChainReader {
  return createPublicClient({
    chain: chains[name].chain,
    transport: http(rpcUrl, { batch: { batchSize: 10 }, retryCount: 5, retryDelay: 500 }),
  });
}
