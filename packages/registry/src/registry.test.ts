import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { lookupSpender } from "./registry.js";
import { KNOWN_SPENDERS } from "./spenders.js";

const PERMALINK = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/[0-9a-f]{40}\/\S+$/;

describe("KNOWN_SPENDERS", () => {
  it.each(KNOWN_SPENDERS.map((s) => [`${s.name} ${s.address}`, s] as const))(
    "%s follows the listing rules",
    (_, spender) => {
      expect(spender.address).toBe(getAddress(spender.address));
      expect(spender.chains.length).toBeGreaterThan(0);

      const repos = spender.sources.map((url) => url.match(PERMALINK)?.[1]);
      expect(repos, "sources must be GitHub permalinks pinned to a commit").not.toContain(
        undefined,
      );
      expect(
        new Set(repos).size,
        "sources must come from two or more repositories",
      ).toBeGreaterThan(1);

      if (spender.status !== "active") expect(spender.statusNote).toBeTruthy();
    },
  );

  it("lists each address at most once per chain", () => {
    const keys = KNOWN_SPENDERS.flatMap((s) =>
      s.chains.map((c) => `${c}:${s.address.toLowerCase()}`),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("lookupSpender", () => {
  const ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

  it("matches the full address regardless of letter case", () => {
    expect(lookupSpender(1, ROUTER)?.name).toBe("Uniswap V2 Router 02");
    expect(lookupSpender(1, ROUTER.toLowerCase() as `0x${string}`)?.name).toBe(
      "Uniswap V2 Router 02",
    );
  });

  it("does not match the same address on a chain it is not listed for", () => {
    // On Base, Uniswap V2 Router 02 lives at a different address.
    expect(lookupSpender(8453, ROUTER)).toBeUndefined();
  });

  it("does not match a lookalike address", () => {
    expect(lookupSpender(1, "0x7a250d5630B4cF539739dF2C5dAcb4c659F2489D")).toBeUndefined();
  });
});
