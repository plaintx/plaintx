import type { AssetInfo, ScanCache, SpenderFacts, WalletHistory } from "@plaintx/chain";
import type { Address } from "@plaintx/core";
import type { JSONValue, Sql } from "postgres";

/**
 * How long spender facts stay fresh. Code, verification and proxy admins rarely change, but an
 * admin handover should show up the same day. See ADR 0010.
 */
export const SPENDER_FACTS_TTL_SECONDS = 6 * 60 * 60;

/**
 * How long asset names, symbols and decimals stay fresh. Decimals never change; a name or symbol
 * changes only on a rare rebrand. See ADR 0011.
 */
export const ASSET_INFO_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface PostgresCacheOptions {
  spenderFactsTtlSeconds?: number;
  assetInfoTtlSeconds?: number;
}

/** A ScanCache shared by every server that points at the same database. Run `migrate` first. */
export function postgresCache(
  sql: Sql,
  {
    spenderFactsTtlSeconds = SPENDER_FACTS_TTL_SECONDS,
    assetInfoTtlSeconds = ASSET_INFO_TTL_SECONDS,
  }: PostgresCacheOptions = {},
): ScanCache {
  return {
    async getHistory(chainId, owner) {
      const [row] = await sql<
        { candidates: WalletHistory["candidates"]; scanned_to_block: string }[]
      >`
        select candidates, scanned_to_block from wallet_history
        where chain_id = ${chainId} and owner = ${owner.toLowerCase()}`;
      return row
        ? { candidates: row.candidates, scannedToBlock: Number(row.scanned_to_block) }
        : null;
    },

    async putHistory(chainId, owner, { candidates, scannedToBlock }) {
      await sql`
        insert into wallet_history (chain_id, owner, candidates, scanned_to_block)
        values (
          ${chainId}, ${owner.toLowerCase()},
          ${sql.json(candidates as unknown as JSONValue)}, ${scannedToBlock}
        )
        on conflict (chain_id, owner) do update set
          candidates = excluded.candidates,
          scanned_to_block = excluded.scanned_to_block,
          updated_at = now()`;
    },

    async getSpenderFacts(chainId, spenders) {
      const found = new Map<Address, SpenderFacts>();
      if (spenders.length === 0) return found;
      // Answer with the caller's spelling of each address.
      const byKey = new Map(spenders.map((s) => [s.toLowerCase(), s]));
      const rows = await sql<{ address: string; facts: SpenderFacts }[]>`
        select address, facts from spender_facts
        where chain_id = ${chainId}
          and address in ${sql([...byKey.keys()])}
          and fetched_at > now() - make_interval(secs => ${spenderFactsTtlSeconds})`;
      for (const { address, facts } of rows) {
        const spender = byKey.get(address);
        if (spender) found.set(spender, facts);
      }
      return found;
    },

    async putSpenderFacts(chainId, facts) {
      if (facts.size === 0) return;
      const rows = [...facts].map(([address, f]) => ({
        chain_id: chainId,
        address: address.toLowerCase(),
        facts: sql.json(f as unknown as JSONValue),
      }));
      await sql`
        insert into spender_facts ${sql(rows)}
        on conflict (chain_id, address) do update set
          facts = excluded.facts,
          fetched_at = now()`;
    },

    async getAssetInfo(chainId, assets) {
      const found = new Map<Address, AssetInfo>();
      if (assets.length === 0) return found;
      const byKey = new Map(assets.map((a) => [a.toLowerCase(), a]));
      const rows = await sql<{ address: string; info: AssetInfo }[]>`
        select address, info from asset_info
        where chain_id = ${chainId}
          and address in ${sql([...byKey.keys()])}
          and fetched_at > now() - make_interval(secs => ${assetInfoTtlSeconds})`;
      for (const { address, info } of rows) {
        const asset = byKey.get(address);
        if (asset) found.set(asset, info);
      }
      return found;
    },

    async putAssetInfo(chainId, info) {
      if (info.size === 0) return;
      const rows = [...info].map(([address, i]) => ({
        chain_id: chainId,
        address: address.toLowerCase(),
        info: sql.json(i as unknown as JSONValue),
      }));
      await sql`
        insert into asset_info ${sql(rows)}
        on conflict (chain_id, address) do update set
          info = excluded.info,
          fetched_at = now()`;
    },
  };
}
