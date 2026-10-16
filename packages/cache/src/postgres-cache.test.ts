import type { AssetInfo, SpenderFacts } from "@plaintx/chain";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "./migrations.js";
import { postgresCache } from "./postgres-cache.js";

// Needs a real database: `docker compose up -d`, then run with DATABASE_URL set (CI does).
const url = process.env.DATABASE_URL;

// A chain id no real chain uses, so tests never touch cached production data.
const CHAIN = 999_000_000 + Math.floor(Math.random() * 1_000_000);
const OWNER = "0x00000000000000000000000000000000000000Aa";
const TOKEN = "0x1111111111111111111111111111111111111111";
const APP = "0x3333333333333333333333333333333333333333";
const WALLET = "0x4444444444444444444444444444444444444444";
const facts: SpenderFacts = {
  isContract: true,
  verified: true,
  upgradeability: {
    proxy: "eip1967",
    implementation: TOKEN,
    controller: { kind: "multisig", address: WALLET, threshold: 3, owners: 5 },
  },
};

describe.skipIf(!url)("postgresCache", () => {
  const sql = postgres(url as string, { max: 2, onnotice: () => {} });

  beforeAll(async () => {
    await migrate(sql);
  });
  afterAll(async () => {
    await sql`delete from wallet_history where chain_id = ${CHAIN}`;
    await sql`delete from spender_facts where chain_id = ${CHAIN}`;
    await sql`delete from asset_info where chain_id = ${CHAIN}`;
    await sql.end();
  });

  it("migrates once, even when run again", async () => {
    expect(await migrate(sql)).toBe(0);
  });

  it("stores and replaces a wallet's history, whatever the address casing", async () => {
    const cache = postgresCache(sql);
    expect(await cache.getHistory(CHAIN, OWNER)).toBeNull();

    const first = {
      candidates: [{ kind: "erc20", token: TOKEN, spender: APP }],
      scannedToBlock: 10,
    };
    await cache.putHistory(CHAIN, OWNER, first as never);
    expect(await cache.getHistory(CHAIN, OWNER.toLowerCase() as never)).toEqual(first);

    const second = { ...first, scannedToBlock: 20_000_000_000 };
    await cache.putHistory(CHAIN, OWNER, second as never);
    expect(await cache.getHistory(CHAIN, OWNER)).toEqual(second);
  });

  it("returns fresh spender facts keyed by the caller's spelling", async () => {
    const cache = postgresCache(sql);
    await cache.putSpenderFacts(CHAIN, new Map([[APP, facts]]));

    const lower = APP.toLowerCase() as `0x${string}`;
    const found = await cache.getSpenderFacts(CHAIN, [lower, WALLET]);
    expect([...found]).toEqual([[lower, facts]]);
  });

  it("leaves out facts older than the TTL", async () => {
    await postgresCache(sql).putSpenderFacts(CHAIN, new Map([[WALLET, facts]]));
    await sql`
      update spender_facts set fetched_at = now() - interval '2 hours'
      where chain_id = ${CHAIN} and address = ${WALLET.toLowerCase()}`;

    const strict = postgresCache(sql, { spenderFactsTtlSeconds: 3600 });
    expect((await strict.getSpenderFacts(CHAIN, [WALLET])).size).toBe(0);
    const lenient = postgresCache(sql, { spenderFactsTtlSeconds: 3 * 3600 });
    expect((await lenient.getSpenderFacts(CHAIN, [WALLET])).size).toBe(1);
  });

  it("stores asset info, including an empty answer, and drops it after the TTL", async () => {
    const cache = postgresCache(sql);
    const usdc: AssetInfo = { name: "USD Coin", symbol: "USDC", decimals: 6 };
    await cache.putAssetInfo(
      CHAIN,
      new Map<`0x${string}`, AssetInfo>([
        [TOKEN, usdc],
        [APP, {}],
      ]),
    );
    const lower = TOKEN.toLowerCase() as `0x${string}`;
    const found = await cache.getAssetInfo(CHAIN, [lower, APP, WALLET]);
    expect(Object.fromEntries(found)).toEqual({ [lower]: usdc, [APP]: {} });

    await sql`
      update asset_info set fetched_at = now() - interval '2 hours'
      where chain_id = ${CHAIN} and address = ${lower}`;
    const strict = postgresCache(sql, { assetInfoTtlSeconds: 3600 });
    expect([...(await strict.getAssetInfo(CHAIN, [TOKEN]))]).toEqual([]);
  });
});
