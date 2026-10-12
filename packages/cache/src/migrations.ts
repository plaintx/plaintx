import type { Sql } from "postgres";

/**
 * Schema changes, applied in order. Never edit one that has shipped: add a new entry instead.
 * Addresses are stored lowercase so that checksummed and plain spellings share a row.
 */
const MIGRATIONS: readonly string[] = [
  `
  create table wallet_history (
    chain_id integer not null,
    owner text not null,
    candidates jsonb not null,
    scanned_to_block bigint not null,
    updated_at timestamptz not null default now(),
    primary key (chain_id, owner)
  );
  create table spender_facts (
    chain_id integer not null,
    address text not null,
    facts jsonb not null,
    fetched_at timestamptz not null default now(),
    primary key (chain_id, address)
  );
  `,
];

/** Arbitrary constant naming our advisory lock, so parallel deploys migrate one at a time. */
const LOCK_ID = 7_027_001;

/** Brings the schema up to date. Safe to run from several servers at once. */
export async function migrate(sql: Sql): Promise<number> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK_ID})`;
    await tx`
      create table if not exists schema_migrations (
        version integer primary key,
        applied_at timestamptz not null default now()
      )`;
    const [row] = await tx<{ version: number | null }[]>`
      select max(version) as version from schema_migrations`;
    const current = row?.version ?? 0;
    for (let v = current + 1; v <= MIGRATIONS.length; v++) {
      await tx.unsafe(MIGRATIONS[v - 1] as string);
      await tx`insert into schema_migrations (version) values (${v})`;
    }
    return MIGRATIONS.length - current;
  });
}
