import { type Address, type Approval, PERMIT2, type SpenderInfo } from "@plaintx/core";
import {
  type Blocklist,
  type BlocklistResult,
  bundledBlocklist,
  lookupSpender,
} from "@plaintx/registry";
import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  erc20Abi,
  type PublicClient,
  parseAbi,
} from "viem";
import { isContractCode } from "./code.js";
import type { Candidate } from "./discovery.js";
import type { Etherscan } from "./etherscan.js";
import { readUpgradeability } from "./upgradeability.js";

export type ChainReader = Pick<
  PublicClient,
  "readContract" | "multicall" | "getCode" | "getStorageAt"
>;

const nftAbi = parseAbi([
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
]);
const permit2Abi = parseAbi([
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);

/**
 * Calls per Multicall3 request. Each request costs the provider about as much as a single
 * eth_call, so a wallet with thousands of candidates needs only a handful of requests instead of
 * thousands (which free-tier RPC endpoints reject with HTTP 429).
 */
const MULTICALL_SIZE = 500;

/**
 * Reads the live value of each candidate and keeps the ones that still grant something.
 * Calls that revert (non-standard or self-destructed tokens) are skipped. Any other failure,
 * such as a network error, is thrown: silently dropping an approval could hide a real risk.
 */
export async function readActiveApprovals(
  client: ChainReader,
  chainId: number,
  owner: Address,
  candidates: readonly Candidate[],
): Promise<Approval[]> {
  const approvals: Approval[] = [];
  for (let i = 0; i < candidates.length; i += MULTICALL_SIZE) {
    const group = candidates.slice(i, i + MULTICALL_SIZE);
    const results = await client.multicall({
      contracts: group.map((c) => toCall(owner, c)),
      allowFailure: true,
      // We size the groups ourselves; 0 stops viem from splitting them further.
      batchSize: 0,
    });
    for (const [j, c] of group.entries()) {
      const r = results[j];
      if (!r) throw new Error("Multicall returned fewer results than calls");
      const approval =
        r.status === "failure" ? skipReverts(r.error) : toApproval(chainId, c, r.result);
      if (approval) approvals.push(approval);
    }
  }
  return approvals;
}

function skipReverts(error: unknown): null {
  const reverted =
    error instanceof BaseError &&
    error.walk(
      (e) =>
        e instanceof ContractFunctionRevertedError || e instanceof ContractFunctionZeroDataError,
    );
  if (reverted) return null;
  throw error;
}

function toCall(owner: Address, c: Candidate) {
  switch (c.kind) {
    case "erc20":
      return {
        address: c.token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, c.spender],
      } as const;
    case "nft-all":
      return {
        address: c.collection,
        abi: nftAbi,
        functionName: "isApprovedForAll",
        args: [owner, c.spender],
      } as const;
    case "permit2":
      return {
        address: PERMIT2,
        abi: permit2Abi,
        functionName: "allowance",
        args: [owner, c.token, c.spender],
      } as const;
  }
}

function toApproval(chainId: number, c: Candidate, result: unknown): Approval | null {
  switch (c.kind) {
    case "erc20": {
      const amount = result as bigint;
      return amount > 0n ? { ...c, chainId, amount } : null;
    }
    case "nft-all":
      return result ? { ...c, chainId } : null;
    case "permit2": {
      const [amount, expiration] = result as readonly [bigint, number, number];
      // Expired ones are kept; core decides they are harmless.
      return amount > 0n ? { ...c, chainId, amount, expiration } : null;
    }
  }
}

/**
 * Facts about each spender. Reputation is "known" only for a registry entry that also has
 * contract code here: a listed address without code is not the app it claims to be.
 * A scam-list match makes it "malicious", even for a registry entry.
 * If Etherscan cannot answer (e.g. a chain outside the free tier), `verified` is "unknown".
 */
export async function readSpenderInfo(
  client: ChainReader,
  etherscan: Etherscan,
  chainId: number,
  spenders: readonly Address[],
  blocklist: Blocklist = bundledBlocklist,
): Promise<Map<Address, SpenderInfo>> {
  const info = new Map<Address, SpenderInfo>();
  for (const spender of new Set(spenders)) {
    const facts = await readFacts(client, etherscan, chainId, spender);
    // A blocklist that throws counts as unavailable: never as "not listed".
    const listing = await blocklist
      .check(chainId, spender)
      .catch((): BlocklistResult => ({ status: "unavailable" }));
    info.set(spender, withListing(facts, listing));
  }
  return info;
}

async function readFacts(
  client: ChainReader,
  etherscan: Etherscan,
  chainId: number,
  spender: Address,
): Promise<SpenderInfo> {
  const isContract = isContractCode(await client.getCode({ address: spender }));
  if (!isContract) return { reputation: "unknown", isContract, verified: false };

  const verified = await etherscan.isVerified(chainId, spender).catch(() => "unknown" as const);
  const upgradeability = await readUpgradeability(client, spender);
  const known = lookupSpender(chainId, spender);
  return known
    ? {
        reputation: "known",
        isContract,
        verified,
        name: known.name,
        status: known.status,
        upgradeability,
      }
    : { reputation: "unknown", isContract, verified, upgradeability };
}

function withListing(info: SpenderInfo, listing: BlocklistResult): SpenderInfo {
  switch (listing.status) {
    case "listed":
      return {
        ...info,
        reputation: "malicious",
        listedBy: listing.matches.map((m) => (m.note ? `${m.source}: ${m.note}` : m.source)),
      };
    case "unavailable":
      return { ...info, blocklistUnavailable: true };
    case "not-listed":
      return info;
  }
}
