import type { Sql } from "postgres";
import { ASSET_INFO_TTL_SECONDS, SPENDER_FACTS_TTL_SECONDS } from "./postgres-cache.js";

/**
 * A wallet's cached approval history is deleted when nobody has checked it for this long. The
 * next check rebuilds it from scratch. See ADR 0018.
 */
export const HISTORY_RETENTION_DAYS = 90;

export interface PruneOptions {
  historyRetentionDays?: number;
  spenderFactsTtlSeconds?: number;
  assetInfoTtlSeconds?: number;
  /** Rows per delete statement: short statements keep locks short. */
  batchSize?: number;
  /** Stops after this many statements per table, so one run cannot outlast its time limit. */
  maxBatches?: number;
}

export interface PruneResult {
  history: number;
  spenderFacts: number;
  assetInfo: number;
  /** True if a table still had rows to delete when `maxBatches` ran out. The next run goes on. */
  incomplete: boolean;
}

/**
 * Deletes what the cache will never use again: histories of wallets nobody checked within the
 * retention period, and spender facts and asset details past their freshness limit (reads
 * already skip those). Safe to run at any time and from several places at once.
 */
export async function pruneCache(
  sql: Sql,
  {
    historyRetentionDays = HISTORY_RETENTION_DAYS,
    spenderFactsTtlSeconds = SPENDER_FACTS_TTL_SECONDS,
    assetInfoTtlSeconds = ASSET_INFO_TTL_SECONDS,
    batchSize = 5_000,
    maxBatches = 100,
  }: PruneOptions = {},
): Promise<PruneResult> {
  let incomplete = false;

  async function drain(deleteBatch: () => Promise<number>): Promise<number> {
    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      const deleted = await deleteBatch();
      total += deleted;
      if (deleted < batchSize) return total;
    }
    incomplete = true;
    return total;
  }

  const history = await drain(async () => {
    const rows = await sql`
      delete from wallet_history w using (
        select chain_id, owner from wallet_history
        where updated_at < now() - make_interval(days => ${historyRetentionDays})
        limit ${batchSize}
      ) old
      where w.chain_id = old.chain_id and w.owner = old.owner
      returning 1`;
    return rows.length;
  });
  const spenderFacts = await drain(async () => {
    const rows = await sql`
      delete from spender_facts f using (
        select chain_id, address from spender_facts
        where fetched_at < now() - make_interval(secs => ${spenderFactsTtlSeconds})
        limit ${batchSize}
      ) old
      where f.chain_id = old.chain_id and f.address = old.address
      returning 1`;
    return rows.length;
  });
  const assetInfo = await drain(async () => {
    const rows = await sql`
      delete from asset_info a using (
        select chain_id, address from asset_info
        where fetched_at < now() - make_interval(secs => ${assetInfoTtlSeconds})
        limit ${batchSize}
      ) old
      where a.chain_id = old.chain_id and a.address = old.address
      returning 1`;
    return rows.length;
  });
  return { history, spenderFacts, assetInfo, incomplete };
}
