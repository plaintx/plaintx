import { type Address, type RankedApproval, rankApprovals } from "@plaintx/core";
import type { Blocklist } from "@plaintx/registry";
import { findCandidates } from "./discovery.js";
import type { Etherscan } from "./etherscan.js";
import { type ChainReader, readActiveApprovals, readSpenderInfo } from "./state.js";

export interface ScanOptions {
  owner: Address;
  chainId: number;
  client: ChainReader;
  etherscan: Etherscan;
  /** Unix timestamp in seconds. */
  now: number;
  /** Scam lists to check spenders against. Defaults to the lists bundled in @plaintx/registry. */
  blocklist?: Blocklist;
}

/** Finds a wallet's active approvals on one chain and ranks them riskiest first. */
export async function scanWallet({
  owner,
  chainId,
  client,
  etherscan,
  now,
  blocklist,
}: ScanOptions): Promise<RankedApproval[]> {
  const candidates = await findCandidates(etherscan, chainId, owner);
  const approvals = await readActiveApprovals(client, chainId, owner, candidates);
  const spenders = await readSpenderInfo(
    client,
    etherscan,
    chainId,
    approvals.map((a) => a.spender),
    blocklist,
  );
  return rankApprovals(
    approvals.flatMap((approval) => {
      const spender = spenders.get(approval.spender);
      return spender ? [{ approval, spender }] : [];
    }),
    now,
  );
}
