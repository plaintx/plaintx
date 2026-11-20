import "server-only";
import { postgresCache } from "@plaintx/cache";
import type { ScanCache } from "@plaintx/chain";
import postgres from "postgres";

// One pool per server process. Next.js dev reloads modules, so keep it on globalThis.
const globals = globalThis as { plaintxCache?: ScanCache | null };

/** The shared Postgres cache, or null when DATABASE_URL is not set. See ADR 0010. */
function scanCache(): ScanCache | null {
  if (globals.plaintxCache === undefined) {
    const url = process.env.DATABASE_URL;
    globals.plaintxCache = url
      ? postgresCache(postgres(url, { max: 10, connect_timeout: 5, onnotice: () => {} }))
      : null;
  }
  return globals.plaintxCache;
}

/** A failing cache only slows scans down, so it is logged rather than shown to the user. */
export function cacheOptions() {
  const cache = scanCache();
  if (!cache) return {};
  const url = process.env.DATABASE_URL as string;
  return {
    cache,
    onCacheError: (error: unknown) =>
      console.warn("Scan cache unavailable:", String(error).replaceAll(url, "<DATABASE_URL>")),
  };
}
