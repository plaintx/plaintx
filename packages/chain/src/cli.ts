/**
 * Developer tool: scan one wallet and print its approvals, riskiest first.
 * Usage: pnpm --filter @plaintx/chain scan <address> [chain]   (chain: ethereum | base | arbitrum)
 * Reads ETHERSCAN_API_KEY and ETH_RPC_URL / BASE_RPC_URL / ARBITRUM_RPC_URL from the root .env.
 */
import { BaseError, createPublicClient, http, isAddress } from "viem";
import { arbitrum, base, mainnet } from "viem/chains";
import { createEtherscan } from "./etherscan.js";
import { scanWallet } from "./scan.js";

const chains = {
  ethereum: { chain: mainnet, rpcEnv: "ETH_RPC_URL" },
  base: { chain: base, rpcEnv: "BASE_RPC_URL" },
  arbitrum: { chain: arbitrum, rpcEnv: "ARBITRUM_RPC_URL" },
} as const;

const [owner, chainName = "ethereum"] = process.argv.slice(2);
if (!owner || !isAddress(owner) || !(chainName in chains)) {
  console.error("Usage: pnpm --filter @plaintx/chain scan <address> [ethereum|base|arbitrum]");
  process.exit(1);
}
const { chain, rpcEnv } = chains[chainName as keyof typeof chains];
const rpcUrl = process.env[rpcEnv];
const apiKey = process.env.ETHERSCAN_API_KEY;
if (!rpcUrl || !apiKey) {
  console.error(`Set ${rpcEnv} and ETHERSCAN_API_KEY in .env`);
  process.exit(1);
}

// Small batches and patient retries keep free-tier endpoints from rejecting us (HTTP 429).
const client = createPublicClient({
  chain,
  transport: http(rpcUrl, { batch: { batchSize: 10 }, retryCount: 5, retryDelay: 500 }),
});

let ranked: Awaited<ReturnType<typeof scanWallet>>;
try {
  ranked = await scanWallet({
    owner,
    chainId: chain.id,
    client,
    etherscan: createEtherscan({ apiKey }),
    now: Math.floor(Date.now() / 1000),
  });
} catch (error) {
  // Provider URLs carry API keys, and viem errors include the URL: print a redacted summary only.
  const message = error instanceof BaseError ? error.shortMessage : String(error);
  console.error(`Scan failed: ${redact(message)}`);
  if (error instanceof BaseError && "status" in error)
    console.error(`HTTP status: ${error.status}`);
  process.exit(1);
}

console.log(`${ranked.length} active approval(s) for ${owner} on ${chain.name}\n`);
for (const { approval, verdict } of ranked) {
  const asset = approval.kind === "nft-all" ? approval.collection : approval.token;
  console.log(`[${verdict.level}] ${approval.kind} ${asset} -> ${approval.spender}`);
  for (const f of verdict.findings) console.log(`    - ${f.summary}`);
}

function redact(text: string): string {
  return text
    .replaceAll(rpcUrl as string, "<RPC_URL>")
    .replaceAll(apiKey as string, "<API_KEY>")
    .replace(/https?:\/\/\S+/g, "<URL>");
}
