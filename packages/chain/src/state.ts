import { type Address, type Approval, PERMIT2, type SpenderInfo } from "@plaintx/core";
import { lookupSpender } from "@plaintx/registry";
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

export type ChainReader = Pick<PublicClient, "readContract" | "getCode" | "getStorageAt">;

const nftAbi = parseAbi([
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
]);
const permit2Abi = parseAbi([
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);

/** Reads in small groups so free-tier RPC endpoints don't rate-limit us. */
const CONCURRENCY = 10;

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
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const group = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      group.map((c) => readApproval(client, chainId, owner, c).catch(skipReverts)),
    );
    for (const approval of results) if (approval) approvals.push(approval);
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

async function readApproval(
  client: ChainReader,
  chainId: number,
  owner: Address,
  c: Candidate,
): Promise<Approval | null> {
  switch (c.kind) {
    case "erc20": {
      const amount = await client.readContract({
        address: c.token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, c.spender],
      });
      return amount > 0n ? { ...c, chainId, amount } : null;
    }
    case "nft-all": {
      const approved = await client.readContract({
        address: c.collection,
        abi: nftAbi,
        functionName: "isApprovedForAll",
        args: [owner, c.spender],
      });
      return approved ? { ...c, chainId } : null;
    }
    case "permit2": {
      const [amount, expiration] = await client.readContract({
        address: PERMIT2,
        abi: permit2Abi,
        functionName: "allowance",
        args: [owner, c.token, c.spender],
      });
      // Expired ones are kept; core decides they are harmless.
      return amount > 0n ? { ...c, chainId, amount, expiration } : null;
    }
  }
}

/**
 * Facts about each spender. Reputation is "known" only for a registry entry that also has
 * contract code here: a listed address without code is not the app it claims to be.
 * If Etherscan cannot answer (e.g. a chain outside the free tier), `verified` is "unknown".
 */
export async function readSpenderInfo(
  client: ChainReader,
  etherscan: Etherscan,
  chainId: number,
  spenders: readonly Address[],
): Promise<Map<Address, SpenderInfo>> {
  const info = new Map<Address, SpenderInfo>();
  for (const spender of new Set(spenders)) {
    const isContract = isContractCode(await client.getCode({ address: spender }));
    if (!isContract) {
      info.set(spender, { reputation: "unknown", isContract, verified: false });
      continue;
    }
    const verified = await etherscan.isVerified(chainId, spender).catch(() => "unknown" as const);
    const upgradeability = await readUpgradeability(client, spender);
    const known = lookupSpender(chainId, spender);
    info.set(
      spender,
      known
        ? {
            reputation: "known",
            isContract,
            verified,
            name: known.name,
            status: known.status,
            upgradeability,
          }
        : { reputation: "unknown", isContract, verified, upgradeability },
    );
  }
  return info;
}
