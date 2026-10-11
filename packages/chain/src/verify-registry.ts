/**
 * Maintainer tool: re-checks every registry entry against live data (see ADR 0005).
 * Usage: pnpm --filter @plaintx/chain registry:verify
 * For each entry and chain: the address has contract code and verified source on Etherscan.
 * For each source: the pinned file still downloads and contains the address.
 * Exits non-zero if anything fails. Not run in CI, which makes no network calls.
 */
import { KNOWN_SPENDERS } from "@plaintx/registry";
import { BaseError } from "viem";
import { type ChainName, chains, createClient } from "./chains.js";
import { createEtherscan } from "./etherscan.js";
import { type ChainReader, isContractCode } from "./state.js";

const apiKey = process.env.ETHERSCAN_API_KEY;
if (!apiKey) {
  console.error("Set ETHERSCAN_API_KEY in .env");
  process.exit(1);
}
const etherscan = createEtherscan({ apiKey });
const secrets = [apiKey];

const clients = new Map<number, ChainReader>();
for (const name of Object.keys(chains) as ChainName[]) {
  const rpcUrl = process.env[chains[name].rpcEnv];
  if (!rpcUrl) continue;
  secrets.push(rpcUrl);
  clients.set(chains[name].chain.id, createClient(name, rpcUrl));
}

let failures = 0;
function report(ok: boolean, message: string) {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
}

for (const spender of KNOWN_SPENDERS) {
  for (const chainId of spender.chains) {
    const where = `${spender.name} ${spender.address} on chain ${chainId}`;
    const client = clients.get(chainId);
    if (!client) {
      report(false, `${where}: no RPC URL configured`);
      continue;
    }
    try {
      const code = await client.getCode({ address: spender.address });
      const verified = await etherscan.isVerified(chainId, spender.address);
      report(isContractCode(code) && verified, `${where}: contract code and verified source`);
    } catch (error) {
      report(false, `${where}: ${describe(error)}`);
    }
  }
}

const sourceText = new Map<string, Promise<string>>();
for (const spender of KNOWN_SPENDERS) {
  for (const url of spender.sources) {
    if (!sourceText.has(url)) sourceText.set(url, download(url));
    try {
      const text = await (sourceText.get(url) as Promise<string>);
      report(
        text.includes(spender.address.toLowerCase()),
        `${spender.name} ${spender.address} in ${url}`,
      );
    } catch (error) {
      report(false, `${url}: ${describe(error)}`);
    }
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);

/** Fetches the raw file behind a GitHub permalink, lower-cased for address matching. */
async function download(permalink: string): Promise<string> {
  const raw = permalink.replace(
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\//,
    "https://raw.githubusercontent.com/$1/",
  );
  const res = await fetch(raw);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).toLowerCase();
}

/** Provider URLs carry API keys and viem errors include them: keep only a redacted summary. */
function describe(error: unknown): string {
  let text = error instanceof BaseError ? error.shortMessage : String(error);
  for (const secret of secrets) text = text.replaceAll(secret, "<redacted>");
  return text.replace(/https?:\/\/\S+/g, "<URL>");
}
