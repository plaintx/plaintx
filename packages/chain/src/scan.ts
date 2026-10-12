import { type Address, type RankedApproval, rankApprovals } from "@plaintx/core";
import type { Blocklist } from "@plaintx/registry";
import type { ScanCache, WalletHistory } from "./cache.js";
import { findCandidates, mergeCandidates } from "./discovery.js";
import type { Etherscan } from "./etherscan.js";
import { type ChainReader, readActiveApprovals, readSpenderInfo } from "./state.js";

/**
 * A cached history is searched again from this many blocks before where it ended. That covers
 * reorgs and Etherscan indexing a little behind our RPC node. Etherscan charges per request, not
 * per block, so the overlap costs nothing; duplicate logs are merged away.
 */
export const RESCAN_BLOCKS = 10_000;

export interface ScanOptions {
  owner: Address;
  chainId: number;
  client: ChainReader;
  etherscan: Etherscan;
  /** Unix timestamp in seconds. */
  now: number;
  /** Scam lists to check spenders against. Defaults to the lists bundled in @plaintx/registry. */
  blocklist?: Blocklist;
  /** Speeds up repeat scans. Without one, every scan starts from scratch. */
  cache?: ScanCache;
  /** Called when the cache fails. The scan carries on without it. */
  onCacheError?: (error: unknown) => void;
}

/** Finds a wallet's active approvals on one chain and ranks them riskiest first. */
export async function scanWallet({
  owner,
  chainId,
  client,
  etherscan,
  now,
  blocklist,
  cache,
  onCacheError = () => {},
}: ScanOptions): Promise<RankedApproval[]> {
  const candidates = await readHistory(client, etherscan, chainId, owner, cache, onCacheError);
  const approvals = await readActiveApprovals(client, chainId, owner, candidates);
  const spenders = await readSpenderInfo(
    client,
    etherscan,
    chainId,
    approvals.map((a) => a.spender),
    blocklist,
    cache,
    onCacheError,
  );
  return rankApprovals(
    approvals.flatMap((approval) => {
      const spender = spenders.get(approval.spender);
      return spender ? [{ approval, spender }] : [];
    }),
    now,
  );
}

/** Every pair the owner has approved: the cached history plus anything newer. */
async function readHistory(
  client: ChainReader,
  etherscan: Etherscan,
  chainId: number,
  owner: Address,
  cache: ScanCache | undefined,
  onCacheError: (error: unknown) => void,
): Promise<WalletHistory["candidates"]> {
  if (!cache) return findCandidates(etherscan, chainId, owner);

  // Read the head first: logs after it may be missed this time, but the next scan covers them.
  const head = Number(await client.getBlockNumber());
  const cached = await cache.getHistory(chainId, owner).catch((error) => {
    onCacheError(error);
    return null;
  });
  const fromBlock = cached ? Math.max(0, cached.scannedToBlock - RESCAN_BLOCKS) : 0;
  const candidates = mergeCandidates(
    cached?.candidates ?? [],
    await findCandidates(etherscan, chainId, owner, fromBlock),
  );
  await cache.putHistory(chainId, owner, { candidates, scannedToBlock: head }).catch(onCacheError);
  return candidates;
}
