import { randomUUID } from "node:crypto";
import { createClient } from "@redis/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectRedisLimiter, KEY_PREFIX, redisRateLimiter } from "./redis.js";

// Needs a real Redis: `docker compose up -d`, then run with REDIS_URL set (CI does).
const url = process.env.REDIS_URL;

describe.skipIf(!url)("redisRateLimiter", () => {
  const client = createClient({ url: url as string });
  const limiter = redisRateLimiter(client);
  // Unique per run, so tests never share state with each other or the app.
  const key = (name: string) => `test:${randomUUID()}:${name}`;

  beforeAll(async () => {
    await client.connect();
  });
  afterAll(async () => {
    await client.close();
  });

  it("allows a burst up to the limit, then refuses with the wait", async () => {
    const ip = key("ip");
    const rule = { limit: 3, periodMs: 60_000 };
    for (let i = 0; i < 3; i++) expect(await limiter.hit(ip, rule)).toBe(0);
    const wait = await limiter.hit(ip, rule);
    expect(wait).toBeGreaterThan(19_000);
    expect(wait).toBeLessThanOrEqual(20_000);
  });

  it("lets the stored time expire with the allowance", async () => {
    const ip = key("ip");
    await limiter.hit(ip, { limit: 2, periodMs: 60_000 });
    const ttl = await client.pTTL(KEY_PREFIX + ip);
    expect(ttl).toBeGreaterThan(29_000);
    expect(ttl).toBeLessThanOrEqual(30_000);
  });

  it("books evenly spaced slots across concurrent callers", async () => {
    const api = key("api");
    const waits = await Promise.all(
      Array.from({ length: 5 }, () => limiter.reserve(api, 1_000, 3_500)),
    );
    const booked = waits.filter((w) => w !== null).sort((a, b) => a - b);
    expect(waits.filter((w) => w === null)).toHaveLength(1);
    booked.forEach((wait, i) => {
      expect(wait).toBeGreaterThan(i * 1_000 - 50);
      expect(wait).toBeLessThanOrEqual(i * 1_000);
    });
  });

  it("works after Redis forgets its scripts", async () => {
    await client.scriptFlush();
    expect(await limiter.hit(key("ip"), { limit: 1, periodMs: 1_000 })).toBe(0);
  });
});

describe("connectRedisLimiter", () => {
  it("limits per server when Redis is unreachable", async () => {
    const onChange = vi.fn();
    // Nothing listens on port 1.
    const limiter = connectRedisLimiter("redis://127.0.0.1:1", { onChange });
    const rule = { limit: 1, periodMs: 60_000 };
    expect(await limiter.hit("ip", rule)).toBe(0);
    expect(await limiter.hit("ip", rule)).toBeGreaterThan(0);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(false, expect.any(Error));
  });
});
