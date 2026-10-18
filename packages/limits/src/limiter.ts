/** At most `limit` requests per `periodMs`, all at once or spread out. */
export interface Rule {
  limit: number;
  periodMs: number;
}

export interface RateLimiter {
  /**
   * Counts one request against `key`. Returns 0 if it is allowed, otherwise how many ms until
   * the next one would be (a refused request is not counted).
   */
  hit(key: string, rule: Rule): Promise<number>;
  /**
   * Books the next free slot in a queue shared by every caller of `key`, with slots
   * `intervalMs` apart. Returns how many ms to wait before using it, or null if that is more
   * than `maxWaitMs` (nothing is booked).
   */
  reserve(key: string, intervalMs: number, maxWaitMs: number): Promise<number | null>;
}

/**
 * Both operations use one stored time per key (GCRA). For `hit` it is the "theoretical arrival
 * time": when the key's allowance is fully used up if nothing more arrives. Times are whole ms.
 */
export function emissionInterval({ limit, periodMs }: Rule): number {
  if (!(limit >= 1 && periodMs >= 1)) throw new RangeError("A rule needs limit and periodMs >= 1");
  return Math.ceil(periodMs / limit);
}

/** Above this many keys, spent ones are swept before adding another. */
const SWEEP_AT = 10_000;

/**
 * Limits kept in this process. Correct for one server; with several, each enforces its own
 * share. Used by tests, CLIs and as the fallback when Redis is unreachable.
 */
export function memoryRateLimiter(now: () => number = Date.now): RateLimiter {
  // Per key, the stored time. Once it is in the past the key is back to a clean state.
  const times = new Map<string, number>();

  function stored(key: string, time: number): number {
    return Math.max(times.get(key) ?? time, time);
  }

  function store(key: string, at: number, time: number) {
    if (times.size >= SWEEP_AT && !times.has(key)) {
      for (const [k, t] of times) if (t <= time) times.delete(k);
    }
    times.set(key, at);
  }

  return {
    async hit(key, rule) {
      const interval = emissionInterval(rule);
      const time = now();
      const tat = stored(key, time);
      const wait = tat + interval - rule.periodMs - time;
      if (wait > 0) return wait;
      store(key, tat + interval, time);
      return 0;
    },

    async reserve(key, intervalMs, maxWaitMs) {
      const time = now();
      const slot = stored(key, time);
      if (slot - time > maxWaitMs) return null;
      store(key, slot + intervalMs, time);
      return slot - time;
    },
  };
}

/**
 * Uses `primary` and switches to `fallback` for any call it fails. `onChange` hears when the
 * primary starts failing and when it works again, not about every failed call.
 */
export function withFallback(
  primary: RateLimiter,
  fallback: RateLimiter,
  onChange: (healthy: boolean, error?: unknown) => void,
): RateLimiter {
  let healthy = true;

  async function attempt<T>(run: (limiter: RateLimiter) => Promise<T>): Promise<T> {
    try {
      const result = await run(primary);
      if (!healthy) {
        healthy = true;
        onChange(true);
      }
      return result;
    } catch (error) {
      if (healthy) {
        healthy = false;
        onChange(false, error);
      }
      return run(fallback);
    }
  }

  return {
    hit: (key, rule) => attempt((limiter) => limiter.hit(key, rule)),
    reserve: (key, intervalMs, maxWaitMs) =>
      attempt((limiter) => limiter.reserve(key, intervalMs, maxWaitMs)),
  };
}

/** Too many requests are already waiting for the shared budget. */
export class BusyError extends Error {
  constructor(key: string) {
    super(`Rate limit queue for ${key} is full`);
    this.name = "BusyError";
  }
}

export interface PacerOptions {
  intervalMs: number;
  maxWaitMs: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A function that resolves when it is this caller's turn to use a budget shared across servers
 * (e.g. an API's requests per second), or throws BusyError when the queue is too long.
 */
export function pacer(
  limiter: RateLimiter,
  key: string,
  {
    intervalMs,
    maxWaitMs,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }: PacerOptions,
): () => Promise<void> {
  return async () => {
    const wait = await limiter.reserve(key, intervalMs, maxWaitMs);
    if (wait === null) throw new BusyError(key);
    if (wait > 0) await sleep(wait);
  };
}
