import "server-only";
import { createHash } from "node:crypto";
import {
  connectRedisLimiter,
  memoryRateLimiter,
  pacer,
  type RateLimiter,
  type Rule,
} from "@plaintx/limits";
import { clientKey } from "./client-ip";

/** Scans per client: 10 at once, then one a minute. See ADR 0012. */
export const SCAN_RULE: Rule = { limit: 10, periodMs: 10 * 60_000 };

/** Longer than this in the shared Etherscan queue and the call gives up as busy. */
const ETHERSCAN_MAX_WAIT_MS = 30_000;

// One connection per server process. Next.js dev reloads modules, so keep it on globalThis.
const globals = globalThis as { plaintxLimiter?: RateLimiter };

/** Limits shared through Redis, or kept per server when REDIS_URL is not set. */
function limiter(): RateLimiter {
  if (!globals.plaintxLimiter) {
    const url = process.env.REDIS_URL;
    if (!url && process.env.NODE_ENV === "production") {
      console.warn("REDIS_URL is not set: each server enforces rate limits on its own.");
    }
    if (process.env.NODE_ENV === "production" && trustedProxies() === 0) {
      console.warn("TRUSTED_PROXY_COUNT is 0: clients can choose their own rate limit key.");
    }
    globals.plaintxLimiter = url
      ? connectRedisLimiter(url, {
          onChange: (healthy, error) =>
            healthy
              ? console.info("Rate limits: Redis is back, limits are shared again.")
              : console.warn(
                  "Rate limits: Redis unavailable, each server limits on its own:",
                  String(error).replaceAll(url, "<REDIS_URL>"),
                ),
        })
      : memoryRateLimiter();
  }
  return globals.plaintxLimiter;
}

function trustedProxies(): number {
  const count = Number(process.env.TRUSTED_PROXY_COUNT ?? 0);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

/** Counts a scan for the client that sent `request`. Returns 0, or ms until it may scan again. */
export function takeScan(request: Request): Promise<number> {
  return limiter().hit(`scan:${clientKey(request.headers, trustedProxies())}`, SCAN_RULE);
}

/**
 * Waits for this server's turn in the Etherscan budget shared by every server using the same
 * API key, or throws BusyError when too many calls are already waiting.
 */
export function etherscanThrottle(apiKey: string): () => Promise<void> {
  const perSecond = Number(process.env.ETHERSCAN_CALLS_PER_SECOND) || 5;
  // The key itself never leaves the server, not even to Redis.
  const id = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  return pacer(limiter(), `etherscan:${id}`, {
    // 10% under the plan's limit, as calls do not arrive at Etherscan exactly when sent.
    intervalMs: Math.ceil(1_100 / perSecond),
    maxWaitMs: ETHERSCAN_MAX_WAIT_MS,
  });
}
