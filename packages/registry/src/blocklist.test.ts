import { describe, expect, it } from "vitest";
import { BLOCKLIST_SOURCES, bundledBlocklist } from "./blocklist.js";
import { BLOCKLIST_ENTRIES } from "./blocklist-data.js";
import { KNOWN_SPENDERS } from "./spenders.js";

describe("BLOCKLIST_ENTRIES", () => {
  it("holds well-formed, unique, lower-case addresses from known sources", () => {
    const addresses = BLOCKLIST_ENTRIES.map(([address]) => address);
    for (const [address, source] of BLOCKLIST_ENTRIES) {
      expect(address).toMatch(/^0x[0-9a-f]{40}$/);
      expect(BLOCKLIST_SOURCES).toHaveProperty(source);
    }
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  it("never lists an address that is also a known app", () => {
    const blocked = new Set(BLOCKLIST_ENTRIES.map(([address]) => address));
    const clashes = KNOWN_SPENDERS.filter((s) => blocked.has(s.address.toLowerCase()));
    expect(clashes.map((s) => s.name)).toEqual([]);
  });
});

describe("bundledBlocklist", () => {
  const [listed, source, note] = BLOCKLIST_ENTRIES[0] as (typeof BLOCKLIST_ENTRIES)[number];
  const checksummed = `0x${listed.slice(2).toUpperCase()}` as const;

  it("finds a listed address regardless of letter case, with its source", async () => {
    expect(await bundledBlocklist.check(1, checksummed)).toEqual({
      status: "listed",
      matches: [{ source: BLOCKLIST_SOURCES[source].name, note }],
    });
  });

  it("only applies to Ethereum, which the bundled lists cover", async () => {
    expect(await bundledBlocklist.check(8453, checksummed)).toEqual({ status: "not-listed" });
  });

  it("reports other addresses as not listed", async () => {
    const other = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    expect(await bundledBlocklist.check(1, other)).toEqual({ status: "not-listed" });
  });
});
