import { describe, expect, it, vi } from "vitest";
import { BusyError, memoryRateLimiter, pacer, type RateLimiter, withFallback } from "./limiter.js";

const RULE = { limit: 3, periodMs: 60_000 };

function clock(start = 1_000_000) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("memoryRateLimiter.hit", () => {
  it("allows a burst up to the limit, then one per interval", async () => {
    const { now, advance } = clock();
    const limiter = memoryRateLimiter(now);
    for (let i = 0; i < 3; i++) expect(await limiter.hit("ip", RULE)).toBe(0);
    expect(await limiter.hit("ip", RULE)).toBe(20_000);

    advance(19_999);
    expect(await limiter.hit("ip", RULE)).toBe(1);
    advance(1);
    expect(await limiter.hit("ip", RULE)).toBe(0);
    expect(await limiter.hit("ip", RULE)).toBe(20_000);
  });

  it("does not count refused requests, and keeps keys apart", async () => {
    const { now, advance } = clock();
    const limiter = memoryRateLimiter(now);
    for (let i = 0; i < 3; i++) await limiter.hit("a", RULE);
    for (let i = 0; i < 10; i++) await limiter.hit("a", RULE);
    expect(await limiter.hit("b", RULE)).toBe(0);

    advance(20_000);
    expect(await limiter.hit("a", RULE)).toBe(0);
  });

  it("is back to a full burst after a quiet period", async () => {
    const { now, advance } = clock();
    const limiter = memoryRateLimiter(now);
    for (let i = 0; i < 3; i++) await limiter.hit("ip", RULE);
    advance(60_000);
    for (let i = 0; i < 3; i++) expect(await limiter.hit("ip", RULE)).toBe(0);
  });

  it("rejects rules that make no sense", async () => {
    await expect(memoryRateLimiter().hit("ip", { limit: 0, periodMs: 1000 })).rejects.toThrow(
      RangeError,
    );
  });
});

describe("memoryRateLimiter.reserve", () => {
  it("books evenly spaced slots and refuses past the maximum wait", async () => {
    const { now, advance } = clock();
    const limiter = memoryRateLimiter(now);
    expect(await limiter.reserve("api", 200, 500)).toBe(0);
    expect(await limiter.reserve("api", 200, 500)).toBe(200);
    expect(await limiter.reserve("api", 200, 500)).toBe(400);
    expect(await limiter.reserve("api", 200, 500)).toBeNull();

    advance(1_000);
    expect(await limiter.reserve("api", 200, 500)).toBe(0);
  });
});

describe("pacer", () => {
  it("waits for the booked slot, and throws BusyError when the queue is full", async () => {
    const sleep = vi.fn(async () => {});
    const turn = pacer(memoryRateLimiter(clock().now), "api", {
      intervalMs: 200,
      maxWaitMs: 200,
      sleep,
    });
    await turn();
    await turn();
    expect(sleep.mock.calls).toEqual([[200]]);
    await expect(turn()).rejects.toThrow(BusyError);
  });
});

describe("withFallback", () => {
  const down: RateLimiter = {
    hit: () => Promise.reject(new Error("redis down")),
    reserve: () => Promise.reject(new Error("redis down")),
  };

  it("uses the fallback while the primary fails, and reports only changes", async () => {
    let failing = true;
    const primary: RateLimiter = {
      hit: (key, rule) => (failing ? down.hit(key, rule) : Promise.resolve(7)),
      reserve: () => Promise.resolve(0),
    };
    const onChange = vi.fn();
    const limiter = withFallback(primary, memoryRateLimiter(), onChange);

    expect(await limiter.hit("ip", RULE)).toBe(0);
    expect(await limiter.hit("ip", RULE)).toBe(0);
    expect(onChange.mock.calls).toEqual([[false, expect.any(Error)]]);

    failing = false;
    expect(await limiter.hit("ip", RULE)).toBe(7);
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("still enforces limits on the fallback", async () => {
    const limiter = withFallback(down, memoryRateLimiter(), () => {});
    for (let i = 0; i < 3; i++) await limiter.hit("ip", RULE);
    expect(await limiter.hit("ip", RULE)).toBeGreaterThan(0);
  });
});
