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
  `
  create table asset_info (
    chain_id integer not null,
    address text not null,
    info jsonb not null,
    fetched_at timestamptz not null default now(),
    primary key (chain_id, address)
  );
  `,
  // Risk-address database (ADR 0017). Rows are never deleted: a false positive is retracted,
  // which keeps the record of what we said and why we stopped saying it.
  `
  create table risk_sources (
    id text primary key,
    name text not null,
    url text not null,
    license text not null,
    created_at timestamptz not null default now()
  );
  create table risk_addresses (
    chain_id integer not null,
    address text not null check (address ~ '^0x[0-9a-f]{40}$'),
    source_id text not null references risk_sources (id),
    category text not null
      check (category in ('drainer', 'phishing', 'scam-token', 'exploit', 'other')),
    note text not null default '',
    evidence text,
    added_at timestamptz not null default now(),
    retracted_at timestamptz,
    retraction_note text,
    primary key (chain_id, address, source_id)
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
