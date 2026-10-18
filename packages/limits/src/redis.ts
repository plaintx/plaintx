import { createHash } from "node:crypto";
import { createClient, ErrorReply } from "@redis/client";
import { emissionInterval, memoryRateLimiter, type RateLimiter, withFallback } from "./limiter.js";

/** Every key this package writes starts with this. */
export const KEY_PREFIX = "plaintx:limits:";

// Both scripts read Redis's own clock, so servers with drifting clocks still agree. Times are
// whole ms: Lua formats large fractional numbers with too few digits.
const NOW = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)`;

/** ARGV: emission interval, period. Returns 0 (counted) or ms until allowed (not counted). */
const HIT = `${NOW}
local interval = tonumber(ARGV[1])
local period = tonumber(ARGV[2])
local tat = math.max(tonumber(redis.call('GET', KEYS[1])) or now, now)
local wait = tat + interval - period - now
if wait > 0 then return wait end
redis.call('SET', KEYS[1], tat + interval, 'PX', tat + interval - now)
return 0`;

/** ARGV: slot interval, max wait. Returns ms until the booked slot, or -1 (nothing booked). */
const RESERVE = `${NOW}
local interval = tonumber(ARGV[1])
local slot = math.max(tonumber(redis.call('GET', KEYS[1])) or now, now)
if slot - now > tonumber(ARGV[2]) then return -1 end
redis.call('SET', KEYS[1], slot + interval, 'PX', slot + interval - now)
return slot - now`;

interface ScriptOptions {
  keys: string[];
  arguments: string[];
}

/** The two commands this package needs; a node-redis client has both. */
export interface ScriptRunner {
  evalSha(sha1: string, options: ScriptOptions): Promise<unknown>;
  eval(script: string, options: ScriptOptions): Promise<unknown>;
}

/** Limits shared by every server, kept in Redis. Each operation is one atomic script call. */
export function redisRateLimiter(redis: ScriptRunner): RateLimiter {
  const scripts = new Map(
    [HIT, RESERVE].map((script) => [script, createHash("sha1").update(script).digest("hex")]),
  );

  async function run(script: string, key: string, args: number[]): Promise<number> {
    const options = { keys: [KEY_PREFIX + key], arguments: args.map(String) };
    const reply = await redis
      .evalSha(scripts.get(script) as string, options)
      .catch((error: unknown) => {
        // First use since Redis started: send the script itself, which also caches it.
        if (error instanceof ErrorReply && error.message.startsWith("NOSCRIPT")) {
          return redis.eval(script, options);
        }
        throw error;
      });
    if (typeof reply !== "number") throw new Error(`Unexpected Redis reply: ${String(reply)}`);
    return reply;
  }

  return {
    hit: (key, rule) => run(HIT, key, [emissionInterval(rule), rule.periodMs]),
    async reserve(key, intervalMs, maxWaitMs) {
      const wait = await run(RESERVE, key, [Math.ceil(intervalMs), Math.floor(maxWaitMs)]);
      return wait < 0 ? null : wait;
    },
  };
}

export interface RedisLimiterOptions {
  /** A Redis call slower than this counts as failed. */
  timeoutMs?: number;
  /** Told when Redis stops or starts working. Per-server limits apply while it is down. */
  onChange?: (healthy: boolean, error?: unknown) => void;
}

/**
 * Connects to Redis at `url` and returns a limiter that never throws because of it: while
 * Redis is unreachable or slow, each server enforces the limits on its own (see ADR 0012).
 */
export function connectRedisLimiter(
  url: string,
  { timeoutMs = 500, onChange = () => {} }: RedisLimiterOptions = {},
): RateLimiter {
  const client = createClient({
    url,
    // Fail fast while disconnected instead of queueing calls until Redis returns.
    disableOfflineQueue: true,
    commandOptions: { timeout: timeoutMs },
    socket: { connectTimeout: 2_000 },
  });
  // Connection errors are reported through failed calls; this only stops them crashing Node.
  client.on("error", () => {});
  // It keeps reconnecting in the background if this first attempt fails.
  client.connect().catch(() => {});
  return withFallback(redisRateLimiter(client), memoryRateLimiter(), onChange);
}
