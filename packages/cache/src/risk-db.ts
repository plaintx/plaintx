import type { Address } from "@plaintx/core";
import {
  BLOCKLIST_ENTRIES,
  BLOCKLIST_SOURCES,
  type Blocklist,
  type BlocklistMatch,
  type BlocklistResult,
} from "@plaintx/registry";
import type { Sql } from "postgres";

/**
 * PlainTx's own risk-address database (ADR 0017), in the same Postgres as the scan cache.
 * Every entry names its source, and every source its licence, so we always know where a claim
 * came from and whether we may publish it.
 */

export type RiskCategory = "drainer" | "phishing" | "scam-token" | "exploit" | "other";
export const RISK_CATEGORIES: readonly RiskCategory[] = [
  "drainer",
  "phishing",
  "scam-token",
  "exploit",
  "other",
];

export interface RiskSource {
  /** Short stable id, e.g. "mew-darklist" or "plaintx-reports". */
  id: string;
  name: string;
  /** Where the data comes from: a pinned commit, a page, or our own process. */
  url: string;
  /** SPDX id, or a short note such as "own data". */
  license: string;
}

export interface RiskEntry {
  chainId: number;
  address: Address;
  sourceId: string;
  category: RiskCategory;
  /** Shown to users next to the source's name. Keep it short and factual. */
  note?: string;
  /** Link to the evidence: a transaction, a report, a post-mortem. */
  evidence?: string;
}

/** A lookup slower than this counts as failed: a scan must not hang on the database. */
export const RISK_DB_TIMEOUT_MS = 2_000;

/**
 * The risk database as a Blocklist. Retracted entries are ignored. A lookup that fails or
 * takes longer than `timeoutMs` answers "unavailable" for every address, never "not-listed".
 */
export function postgresBlocklist(sql: Sql, timeoutMs = RISK_DB_TIMEOUT_MS): Blocklist {
  const checkMany = async (chainId: number, addresses: readonly Address[]) => {
    const results = new Map<Address, BlocklistResult>();
    if (addresses.length === 0) return results;
    // Answer with the caller's spelling of each address.
    const byKey = new Map<string, Address[]>();
    for (const a of addresses)
      byKey.set(a.toLowerCase(), [...(byKey.get(a.toLowerCase()) ?? []), a]);

    const query = sql<{ address: string; name: string; note: string }[]>`
      select r.address, s.name, r.note
      from risk_addresses r join risk_sources s on s.id = r.source_id
      where r.chain_id = ${chainId}
        and r.address in ${sql([...byKey.keys()])}
        and r.retracted_at is null
      order by r.added_at, r.source_id`;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Risk database lookup timed out")), timeoutMs);
    });
    try {
      const rows = await Promise.race([query, timeout]);
      const matches = new Map<string, BlocklistMatch[]>();
      for (const row of rows) {
        matches.set(row.address, [
          ...(matches.get(row.address) ?? []),
          { source: row.name, note: row.note },
        ]);
      }
      for (const [key, spellings] of byKey) {
        const found = matches.get(key);
        for (const a of spellings) {
          results.set(a, found ? { status: "listed", matches: found } : { status: "not-listed" });
        }
      }
      return results;
    } finally {
      clearTimeout(timer);
      // A query that lost the race still runs; make sure it cannot raise an unhandled error.
      query.catch(() => {});
    }
  };
  return {
    async check(chainId, address) {
      return (await checkMany(chainId, [address])).get(address) ?? { status: "unavailable" };
    },
    checkMany,
  };
}

/** Creates or updates a source. */
export async function upsertSource(sql: Sql, source: RiskSource): Promise<void> {
  await sql`
    insert into risk_sources (id, name, url, license)
    values (${source.id}, ${source.name}, ${source.url}, ${source.license})
    on conflict (id) do update set
      name = excluded.name, url = excluded.url, license = excluded.license`;
}

/**
 * Adds entries. With `update` (the default), an existing entry gets the new category, note and
 * evidence; without it, existing entries are left alone. Either way a retracted entry stays
 * retracted: re-importing a list must not bring back a false positive we removed.
 * Returns how many rows were new.
 */
export async function addEntries(
  sql: Sql,
  entries: readonly RiskEntry[],
  { update = true }: { update?: boolean } = {},
): Promise<number> {
  if (entries.length === 0) return 0;
  for (const e of entries) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(e.address)) throw new Error(`Not an address: ${e.address}`);
    if (!RISK_CATEGORIES.includes(e.category)) throw new Error(`Unknown category: ${e.category}`);
  }
  let added = 0;
  // Postgres caps parameters per statement; 1,000 rows of 6 stay well under it.
  for (let i = 0; i < entries.length; i += 1_000) {
    const rows = entries.slice(i, i + 1_000).map((e) => ({
      chain_id: e.chainId,
      address: e.address.toLowerCase(),
      source_id: e.sourceId,
      category: e.category,
      note: e.note ?? "",
      evidence: e.evidence ?? null,
    }));
    // xmax is 0 only on a row this statement inserted, so updates are not counted as new.
    const result = update
      ? await sql<{ inserted: boolean }[]>`
          insert into risk_addresses ${sql(rows)}
          on conflict (chain_id, address, source_id) do update set
            category = excluded.category,
            note = excluded.note,
            evidence = excluded.evidence
          returning (xmax = 0) as inserted`
      : await sql<{ inserted: boolean }[]>`
          insert into risk_addresses ${sql(rows)}
          on conflict (chain_id, address, source_id) do nothing
          returning true as inserted`;
    added += result.filter((r) => r.inserted).length;
  }
  return added;
}

/**
 * Marks an entry as a false positive. It stops matching but stays on record with the reason.
 * Returns how many entries were retracted (0 if none matched or all were already retracted).
 */
export async function retractEntry(
  sql: Sql,
  {
    chainId,
    address,
    sourceId,
    reason,
  }: {
    chainId: number;
    address: Address;
    /** Omit to retract the address from every source. */
    sourceId?: string;
    reason: string;
  },
): Promise<number> {
  if (!reason.trim()) throw new Error("A retraction needs a reason");
  const rows = await sql`
    update risk_addresses set retracted_at = now(), retraction_note = ${reason}
    where chain_id = ${chainId}
      and address = ${address.toLowerCase()}
      and retracted_at is null
      ${sourceId ? sql`and source_id = ${sourceId}` : sql``}
    returning 1`;
  return rows.length;
}

export interface RiskStats {
  sourceId: string;
  chainId: number;
  active: number;
  retracted: number;
}

/** Entry counts per source and chain. */
export async function riskStats(sql: Sql): Promise<RiskStats[]> {
  const rows = await sql<
    { source_id: string; chain_id: number; active: string; retracted: string }[]
  >`
    select source_id, chain_id,
      count(*) filter (where retracted_at is null) as active,
      count(*) filter (where retracted_at is not null) as retracted
    from risk_addresses
    group by source_id, chain_id
    order by source_id, chain_id`;
  return rows.map((r) => ({
    sourceId: r.source_id,
    chainId: r.chain_id,
    active: Number(r.active),
    retracted: Number(r.retracted),
  }));
}

/**
 * Copies the lists bundled in @plaintx/registry (ADR 0008) into the database, with their
 * sources and licences. Safe to run again: it only adds what is missing, never overwrites an
 * entry and never revives a retracted one. Returns how many entries were new.
 */
export async function importBundledLists(sql: Sql): Promise<number> {
  for (const [id, source] of Object.entries(BLOCKLIST_SOURCES)) {
    await upsertSource(sql, { id, name: source.name, url: source.url, license: source.license });
  }
  return addEntries(
    sql,
    BLOCKLIST_ENTRIES.map(([address, sourceId, note]) => ({
      // The bundled lists cover Ethereum only.
      chainId: 1,
      address: address as Address,
      sourceId,
      category: "other",
      note,
    })),
    // Keeps any category or note we have since corrected by hand.
    { update: false },
  );
}
