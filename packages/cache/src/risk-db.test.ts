import { randomUUID } from "node:crypto";
import type { Address } from "@plaintx/core";
import { BLOCKLIST_ENTRIES, BLOCKLIST_SOURCES, checkAll } from "@plaintx/registry";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "./migrations.js";
import {
  addEntries,
  importBundledLists,
  postgresBlocklist,
  retractEntry,
  riskStats,
  upsertSource,
} from "./risk-db.js";

// Needs a real database: `docker compose up -d`, then run with DATABASE_URL set (CI does).
const url = process.env.DATABASE_URL;

// A chain id no real chain uses and a source id unique to this run, so tests never touch
// production data or each other.
const CHAIN = 999_000_000 + Math.floor(Math.random() * 1_000_000);
const SOURCE = `test-${randomUUID()}`;
const OTHER = `${SOURCE}-other`;
const DRAINER: Address = "0xD7A1Ae7D7A1Ae7D7A1Ae7D7A1Ae7D7A1Ae7D7A1A";
const PHISHER: Address = "0x9999999999999999999999999999999999999999";
const CLEAN: Address = "0x1111111111111111111111111111111111111111";

describe.skipIf(!url)("risk database", () => {
  const sql = postgres(url as string, { max: 2, onnotice: () => {} });
  const blocklist = postgresBlocklist(sql);

  beforeAll(async () => {
    await migrate(sql);
    await upsertSource(sql, {
      id: SOURCE,
      name: "Test reports",
      url: "https://example.org",
      license: "own data",
    });
    await upsertSource(sql, {
      id: OTHER,
      name: "Other list",
      url: "https://example.org/2",
      license: "MIT",
    });
  });
  afterAll(async () => {
    await sql`delete from risk_addresses where source_id in (${SOURCE}, ${OTHER})`;
    await sql`delete from risk_sources where id in (${SOURCE}, ${OTHER})`;
    await sql.end();
  });

  it("adds entries, counting only new ones, and finds them in any letter case", async () => {
    const entry = {
      chainId: CHAIN,
      address: DRAINER,
      sourceId: SOURCE,
      category: "drainer" as const,
      note: "Inferno Drainer contract",
      evidence: "https://example.org/tx/1",
    };
    expect(await addEntries(sql, [entry])).toBe(1);
    expect(await addEntries(sql, [{ ...entry, note: "Inferno Drainer" }])).toBe(0);
    const lower = DRAINER.toLowerCase() as Address;
    const results = await blocklist.checkMany?.(CHAIN, [DRAINER, lower, CLEAN]);
    expect(results?.get(DRAINER)).toEqual({
      status: "listed",
      matches: [{ source: "Test reports", note: "Inferno Drainer" }],
    });
    expect(results?.get(lower)).toEqual(results?.get(DRAINER));
    expect(results?.get(CLEAN)).toEqual({ status: "not-listed" });
  });

  it("lists every source that names an address, and keeps chains apart", async () => {
    await addEntries(sql, [
      { chainId: CHAIN, address: PHISHER, sourceId: SOURCE, category: "phishing" },
      { chainId: CHAIN, address: PHISHER, sourceId: OTHER, category: "phishing", note: "kit" },
    ]);
    expect(await blocklist.check(CHAIN, PHISHER)).toEqual({
      status: "listed",
      matches: [
        { source: "Test reports", note: "" },
        { source: "Other list", note: "kit" },
      ],
    });
    expect(await blocklist.check(CHAIN + 1, PHISHER)).toEqual({ status: "not-listed" });
  });

  it("retracts per source or entirely, keeps the record, and never revives on re-add", async () => {
    expect(
      await retractEntry(sql, {
        chainId: CHAIN,
        address: PHISHER,
        sourceId: OTHER,
        reason: "test",
      }),
    ).toBe(1);
    expect(await blocklist.check(CHAIN, PHISHER)).toMatchObject({
      matches: [{ source: "Test reports" }],
    });
    expect(
      await retractEntry(sql, { chainId: CHAIN, address: PHISHER, reason: "false positive" }),
    ).toBe(1);
    expect(await blocklist.check(CHAIN, PHISHER)).toEqual({ status: "not-listed" });
    await addEntries(sql, [
      { chainId: CHAIN, address: PHISHER, sourceId: SOURCE, category: "phishing" },
    ]);
    expect(await blocklist.check(CHAIN, PHISHER)).toEqual({ status: "not-listed" });
    const [row] = await sql<{ retraction_note: string }[]>`
      select retraction_note from risk_addresses
      where chain_id = ${CHAIN} and source_id = ${SOURCE} and address = ${PHISHER.toLowerCase()}`;
    expect(row?.retraction_note).toBe("false positive");
    await expect(
      retractEntry(sql, { chainId: CHAIN, address: PHISHER, reason: " " }),
    ).rejects.toThrow(/needs a reason/);
  });

  it("refuses malformed entries before touching the database", async () => {
    await expect(
      addEntries(sql, [
        { chainId: CHAIN, address: "0x12" as Address, sourceId: SOURCE, category: "other" },
      ]),
    ).rejects.toThrow(/Not an address/);
  });

  it("counts entries per source and chain", async () => {
    const stats = await riskStats(sql);
    expect(stats.find((s) => s.sourceId === SOURCE && s.chainId === CHAIN)).toEqual({
      sourceId: SOURCE,
      chainId: CHAIN,
      active: 1,
      retracted: 1,
    });
  });

  it("imports the bundled lists once, with their sources", async () => {
    await importBundledLists(sql);
    expect(await importBundledLists(sql)).toBe(0);
    const [address, source, note] = BLOCKLIST_ENTRIES[0] as (typeof BLOCKLIST_ENTRIES)[number];
    expect(await blocklist.check(1, address as Address)).toMatchObject({
      status: "listed",
      matches: expect.arrayContaining([{ source: BLOCKLIST_SOURCES[source].name, note }]),
    });
  });

  it("answers unavailable, not clean, when the database cannot be reached", async () => {
    const down = postgres("postgres://nobody:nothing@127.0.0.1:1/none", {
      connect_timeout: 1,
      onnotice: () => {},
    });
    const failing = postgresBlocklist(down, 500);
    await expect(failing.check(CHAIN, DRAINER)).rejects.toThrow();
    // Scans go through checkAll, which turns the failure into "unavailable".
    expect((await checkAll(failing, CHAIN, [DRAINER])).get(DRAINER)).toEqual({
      status: "unavailable",
    });
    await down.end({ timeout: 0 });
  });
});
