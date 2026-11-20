import { chains } from "@plaintx/chain";
import { CHAIN_OPTIONS } from "./types";

/**
 * What /api/health reports (ADR 0015). It names no variables, hosts or versions of
 * dependencies: anyone can read it.
 */
export interface Health {
  /** "down": this deployment cannot run scans. "degraded": scans work, slower or less shared. */
  status: "ok" | "degraded" | "down";
  checks: {
    /** API keys and RPC URLs that every scan needs. */
    config: "ok" | "missing";
    /** Shared rate limits (ADR 0012). Without them each server limits on its own. */
    redis: "ok" | "down" | "not_configured";
    /** Scan cache (ADR 0010). Only whether it is configured; see ADR 0015 for why. */
    database: "configured" | "not_configured";
  };
  /** Short commit hash of the deployment, when the host provides it. */
  commit?: string;
}

/** Environment variables every scan needs: the Etherscan key and each scannable chain's RPC. */
export function requiredEnv(): string[] {
  const rpc = CHAIN_OPTIONS.filter((c) => c.scannable).map((c) => chains[c.name].rpcEnv);
  return ["ETHERSCAN_API_KEY", ...rpc];
}

export interface HealthInputs {
  env: Record<string, string | undefined>;
  redis: () => Promise<Health["checks"]["redis"]>;
}

export async function checkHealth({ env, redis }: HealthInputs): Promise<Health> {
  const config = requiredEnv().every((name) => env[name]?.trim()) ? "ok" : "missing";
  const checks: Health["checks"] = {
    config,
    redis: await redis(),
    database: env.DATABASE_URL?.trim() ? "configured" : "not_configured",
  };
  const status =
    config === "missing"
      ? "down"
      : checks.redis === "ok" && checks.database === "configured"
        ? "ok"
        : "degraded";
  const commit = env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return { status, checks, ...(commit ? { commit } : {}) };
}

/**
 * Runs `check` at most once per `ttlMs` per server, sharing the answer with callers that arrive
 * meanwhile. A public endpoint must not turn each request into a call to Redis.
 */
export function cached<T>(
  check: () => Promise<T>,
  ttlMs: number,
  now: () => number = Date.now,
): () => Promise<T> {
  let last: { at: number; value: Promise<T> } | undefined;
  return () => {
    const time = now();
    if (!last || time - last.at >= ttlMs) {
      const value = check();
      const entry = { at: time, value };
      last = entry;
      // A failed check is not kept: the next caller tries again.
      value.catch(() => {
        if (last === entry) last = undefined;
      });
    }
    return last.value;
  };
}
