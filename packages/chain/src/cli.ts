/**
 * Developer tool: scan one wallet and print its approvals, riskiest first.
 * Usage: pnpm --filter @plaintx/chain scan <address> [chain]   (chain: ethereum | base | arbitrum)
 * Reads ETHERSCAN_API_KEY and ETH_RPC_URL / BASE_RPC_URL / ARBITRUM_RPC_URL from the root .env.
 */
import { BaseError, HttpRequestError, isAddress } from "viem";
import { type ChainName, chains, createClient, describeUpgradeability } from "./chains.js";
import { createEtherscan } from "./etherscan.js";
import { scanWallet } from "./scan.js";

const [owner, chainName = "ethereum"] = process.argv.slice(2);
if (!owner || !isAddress(owner) || !(chainName in chains)) {
  console.error("Usage: pnpm --filter @plaintx/chain scan <address> [ethereum|base|arbitrum]");
  process.exit(1);
}
const { chain, rpcEnv } = chains[chainName as ChainName];
const rpcUrl = process.env[rpcEnv];
const apiKey = process.env.ETHERSCAN_API_KEY;
if (!rpcUrl || !apiKey) {
  console.error(`Set ${rpcEnv} and ETHERSCAN_API_KEY in .env`);
  process.exit(1);
}

const client = createClient(chainName as ChainName, rpcUrl);

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
  const http = error instanceof BaseError && error.walk((e) => e instanceof HttpRequestError);
  if (http instanceof HttpRequestError && http.status) console.error(`HTTP status: ${http.status}`);
  process.exit(1);
}

console.log(`${ranked.length} active approval(s) for ${owner} on ${chain.name}\n`);
for (const { approval, spender, verdict } of ranked) {
  const asset = approval.kind === "nft-all" ? approval.collection : approval.token;
  const label = spender.name
    ? ` (${spender.name}${spender.status === "active" ? "" : `, ${spender.status}`})`
    : "";
  console.log(`[${verdict.level}] ${approval.kind} ${asset} -> ${approval.spender}${label}`);
  for (const f of verdict.findings) console.log(`    - ${f.summary}`);
  for (const listing of spender.listedBy ?? []) console.log(`    · Listed by ${listing}`);
  const upgrades = describeUpgradeability(spender.upgradeability);
  if (upgrades) console.log(`    · ${upgrades}`);
}

function redact(text: string): string {
  return text
    .replaceAll(rpcUrl as string, "<RPC_URL>")
    .replaceAll(apiKey as string, "<API_KEY>")
    .replace(/https?:\/\/\S+/g, "<URL>");
}
