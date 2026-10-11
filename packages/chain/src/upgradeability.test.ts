import { type Hex, HttpRequestError, hexToBigInt, keccak256, numberToHex, pad, toHex } from "viem";
import { describe, expect, it } from "vitest";
import type { ChainReader } from "./state.js";
import { readUpgradeability, SLOTS } from "./upgradeability.js";

const PROXY = "0x1000000000000000000000000000000000000001";
const IMPL = "0x2000000000000000000000000000000000000002";
const ADMIN = "0x3000000000000000000000000000000000000003";
const OWNER = "0x4000000000000000000000000000000000000004";
const BEACON = "0x5000000000000000000000000000000000000005";

interface FakeContract {
  storage?: Partial<Record<Hex, Hex>>;
  /** View function results. A missing function reverts. */
  views?: Record<string, unknown>;
}

/** Addresses in `contracts` have code; any other address is a personal wallet. */
function fakeChain(contracts: Record<string, FakeContract>, failWith?: Error): ChainReader {
  return {
    getCode: async ({ address }: { address: string }) =>
      contracts[address] ? "0x6080" : undefined,
    getStorageAt: async ({ address, slot }: { address: string; slot: Hex }) =>
      contracts[address]?.storage?.[slot] ?? pad("0x0"),
    readContract: async ({ address, functionName }: { address: string; functionName: string }) => {
      if (failWith) throw failWith;
      const views = contracts[address]?.views ?? {};
      if (!(functionName in views)) throw new Error("execution reverted");
      return views[functionName];
    },
  } as unknown as ChainReader;
}

async function controllerOf(chain: ChainReader, address: `0x${string}`) {
  const result = await readUpgradeability(chain, address);
  return result.proxy === "none" ? undefined : result.controller;
}

const slotOf = (address: string) => pad(address as Hex);
const transparent = (admin: string): FakeContract => ({
  storage: { [SLOTS.implementation]: slotOf(IMPL), [SLOTS.admin]: slotOf(admin) },
});

describe("readUpgradeability", () => {
  it("reports no proxy for a plain contract", async () => {
    const chain = fakeChain({ [PROXY]: {} });
    expect(await readUpgradeability(chain, PROXY)).toEqual({ proxy: "none" });
  });

  it("finds a transparent proxy whose admin is a personal wallet", async () => {
    const chain = fakeChain({ [PROXY]: transparent(ADMIN) });
    expect(await readUpgradeability(chain, PROXY)).toEqual({
      proxy: "eip1967",
      implementation: IMPL,
      controller: { kind: "single-key", address: ADMIN },
    });
  });

  it("follows a ProxyAdmin to the multisig that owns it", async () => {
    const chain = fakeChain({
      [PROXY]: transparent(ADMIN),
      [ADMIN]: { views: { owner: OWNER } },
      [OWNER]: { views: { getThreshold: 3n, getOwners: [IMPL, ADMIN, OWNER, PROXY, BEACON] } },
    });
    expect(await controllerOf(chain, PROXY)).toEqual({
      kind: "multisig",
      address: OWNER,
      threshold: 3,
      owners: 5,
    });
  });

  it("treats a 1-of-n multisig as a single key", async () => {
    const chain = fakeChain({
      [PROXY]: transparent(OWNER),
      [OWNER]: { views: { getThreshold: 1n, getOwners: [ADMIN, IMPL] } },
    });
    expect(await controllerOf(chain, PROXY)).toEqual({
      kind: "single-key",
      address: OWNER,
    });
  });

  it("recognises a timelock, but not one with zero delay", async () => {
    const timelock = fakeChain({
      [PROXY]: transparent(ADMIN),
      [ADMIN]: { views: { getMinDelay: 172_800n } },
    });
    expect(await controllerOf(timelock, PROXY)).toEqual({
      kind: "timelock",
      address: ADMIN,
      delaySeconds: 172_800,
    });

    const noDelay = fakeChain({
      [PROXY]: transparent(ADMIN),
      [ADMIN]: { views: { delay: 0n, owner: OWNER } },
    });
    expect(await controllerOf(noDelay, PROXY)).toEqual({
      kind: "single-key",
      address: OWNER,
    });
  });

  it("reports an admin contract it cannot identify as unknown", async () => {
    const chain = fakeChain({ [PROXY]: transparent(ADMIN), [ADMIN]: {} });
    expect(await controllerOf(chain, PROXY)).toEqual({
      kind: "unknown",
      address: ADMIN,
    });
  });

  it("uses owner() for UUPS proxies, which have no admin slot", async () => {
    const storage = { [SLOTS.implementation]: slotOf(IMPL) };
    const owned = fakeChain({ [PROXY]: { storage, views: { owner: OWNER } } });
    expect(await controllerOf(owned, PROXY)).toEqual({
      kind: "single-key",
      address: OWNER,
    });

    const unowned = fakeChain({ [PROXY]: { storage } });
    expect(await controllerOf(unowned, PROXY)).toEqual({ kind: "unknown" });
  });

  it("finds a beacon proxy and the beacon's owner", async () => {
    const chain = fakeChain({
      [PROXY]: { storage: { [SLOTS.beacon]: slotOf(BEACON) } },
      [BEACON]: { views: { implementation: IMPL, owner: OWNER } },
    });
    expect(await readUpgradeability(chain, PROXY)).toEqual({
      proxy: "eip1967-beacon",
      implementation: IMPL,
      controller: { kind: "single-key", address: OWNER },
    });
  });

  it("finds pre-EIP-1967 OpenZeppelin proxies such as USDC", async () => {
    const chain = fakeChain({
      [PROXY]: {
        storage: {
          [SLOTS.legacyImplementation]: slotOf(IMPL),
          [SLOTS.legacyAdmin]: slotOf(ADMIN),
        },
      },
    });
    expect(await readUpgradeability(chain, PROXY)).toEqual({
      proxy: "openzeppelin-legacy",
      implementation: IMPL,
      controller: { kind: "single-key", address: ADMIN },
    });
  });

  it("ignores slot values that are not addresses", async () => {
    const chain = fakeChain({
      [PROXY]: { storage: { [SLOTS.implementation]: `0x${"ff".repeat(32)}` } },
    });
    expect(await readUpgradeability(chain, PROXY)).toEqual({ proxy: "none" });
  });

  it("throws network errors instead of reporting unknown", async () => {
    const chain = fakeChain(
      { [PROXY]: transparent(ADMIN), [ADMIN]: {} },
      new HttpRequestError({ url: "http://rpc", status: 429 }),
    );
    await expect(readUpgradeability(chain, PROXY)).rejects.toThrow(HttpRequestError);
  });
});

describe("SLOTS", () => {
  const minusOne = (label: string) =>
    numberToHex(hexToBigInt(keccak256(toHex(label))) - 1n, { size: 32 });

  it("match their published definitions", () => {
    expect(SLOTS.implementation).toBe(minusOne("eip1967.proxy.implementation"));
    expect(SLOTS.admin).toBe(minusOne("eip1967.proxy.admin"));
    expect(SLOTS.beacon).toBe(minusOne("eip1967.proxy.beacon"));
    expect(SLOTS.proxiable).toBe(keccak256(toHex("PROXIABLE")));
    expect(SLOTS.legacyImplementation).toBe(
      keccak256(toHex("org.zeppelinos.proxy.implementation")),
    );
    expect(SLOTS.legacyAdmin).toBe(keccak256(toHex("org.zeppelinos.proxy.admin")));
  });
});
