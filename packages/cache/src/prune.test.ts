import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "./migrations.js";
import { pruneCache } from "./prune.js";

// Needs a real database: `docker compose up -d`, then run with DATABASE_URL set (CI does).
const url = process.env.DATABASE_URL;

// A chain id no real chain uses, so tests never touch cached production data.
const CHAIN = 999_000_000 + Math.floor(Math.random() * 1_000_000);
const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;

describe.skipIf(!url)("pruneCache", () => {
  const sql = postgres(url as string, { max: 2, onnotice: () => {} });

  beforeAll(async () => {
    await migrate(sql);
    const age = (days: number) => sql`now() - make_interval(days => ${days})`;
    for (const [n, days] of [
      [1, 100],
      [2, 100],
      [3, 100],
      [4, 10],
    ] as const) {
      await sql`
        insert into wallet_history (chain_id, owner, candidates, scanned_to_block, updated_at)
        values (${CHAIN}, ${address(n)}, '[]', 1, ${age(days)})`;
      await sql`
        insert into spender_facts (chain_id, address, facts, fetched_at)
        values (${CHAIN}, ${address(n)}, '{}', ${age(days)})`;
      await sql`
        insert into asset_info (chain_id, address, info, fetched_at)
        values (${CHAIN}, ${address(n)}, '{}', ${age(days)})`;
    }
    await sql`
      insert into spender_facts (chain_id, address, facts) values (${CHAIN}, ${address(5)}, '{}')`;
  });
  afterAll(async () => {
    await sql`delete from wallet_history where chain_id = ${CHAIN}`;
    await sql`delete from spender_facts where chain_id = ${CHAIN}`;
    await sql`delete from asset_info where chain_id = ${CHAIN}`;
    await sql.end();
  });

  const remaining = async (table: "wallet_history" | "spender_facts" | "asset_info") => {
    const column = table === "wallet_history" ? "owner" : "address";
    const rows = await sql<{ key: string }[]>`
      select ${sql(column)} as key from ${sql(table)} where chain_id = ${CHAIN} order by 1`;
    return rows.map((r) => r.key);
  };

  it("deletes in batches, stops at maxBatches and says so, then finishes on the next run", async () => {
    const first = await pruneCache(sql, { batchSize: 1, maxBatches: 2 });
    expect(first.incomplete).toBe(true);
    expect(first.history).toBeGreaterThanOrEqual(2);
    const second = await pruneCache(sql, { batchSize: 1_000 });
    expect(second.incomplete).toBe(false);
    // Other tests may share the database, so only this test's rows are checked.
    expect(await remaining("wallet_history")).toEqual([address(4)]);
  });

  it("keeps fresh facts and drops those past their freshness limit", async () => {
    expect(await remaining("spender_facts")).toEqual([address(5)]);
    // Asset details stay fresh for 30 days: only the 100-day-old ones go.
    expect(await remaining("asset_info")).toEqual([address(4)]);
  });
});
