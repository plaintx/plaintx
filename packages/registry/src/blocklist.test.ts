import type { Address } from "@plaintx/core";
import { describe, expect, it, vi } from "vitest";
import {
  BLOCKLIST_SOURCES,
  type Blocklist,
  type BlocklistResult,
  bundledBlocklist,
  checkAll,
  combineBlocklists,
} from "./blocklist.js";
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

describe("combineBlocklists and checkAll", () => {
  const A: Address = "0x1111111111111111111111111111111111111111";
  const B: Address = "0x2222222222222222222222222222222222222222";
  const C: Address = "0x3333333333333333333333333333333333333333";
  const list = (name: string, listed: Address[]): Blocklist => ({
    check: async (_chain, address) =>
      listed.includes(address)
        ? { status: "listed", matches: [{ source: name, note: "" }] }
        : { status: "not-listed" },
  });
  const down: Blocklist = {
    check: async () => {
      throw new Error("down");
    },
  };

  it("lists an address any list names, with every list's match", async () => {
    const combined = combineBlocklists(list("One", [A]), list("Two", [A, B]));
    const results = await checkAll(combined, 1, [A, B, C]);
    expect(results.get(A)).toEqual({
      status: "listed",
      matches: [
        { source: "One", note: "" },
        { source: "Two", note: "" },
      ],
    });
    expect(results.get(B)).toMatchObject({ status: "listed" });
    expect(results.get(C)).toEqual({ status: "not-listed" });
  });

  it("never lets a list that is down hide a match, or pass an address as clean", async () => {
    const combined = combineBlocklists(list("One", [A]), down);
    expect(await combined.check(1, A)).toMatchObject({ status: "listed" });
    expect(await combined.check(1, B)).toEqual({ status: "unavailable" });
  });

  it("uses a list's batch lookup when it has one, and fills gaps as unavailable", async () => {
    const checkMany = vi.fn(
      async () => new Map<Address, BlocklistResult>([[A, { status: "not-listed" }]]),
    );
    const batch: Blocklist = { check: vi.fn(), checkMany };
    const results = await checkAll(batch, 1, [A, B, A]);
    expect(checkMany).toHaveBeenCalledExactlyOnceWith(1, [A, B]);
    expect(batch.check).not.toHaveBeenCalled();
    expect(results.get(B)).toEqual({ status: "unavailable" });
  });

  it("treats a batch lookup that throws as unavailable", async () => {
    const batch: Blocklist = {
      check: vi.fn(),
      checkMany: async () => {
        throw new Error("timeout");
      },
    };
    expect((await checkAll(batch, 1, [A])).get(A)).toEqual({ status: "unavailable" });
  });
});
