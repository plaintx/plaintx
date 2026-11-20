import { cached, checkHealth } from "@/lib/health";
import { redisStatus } from "@/lib/limits";

export const runtime = "nodejs";

/** At most one Redis PING per server every 30 s, however often this is called. */
const health = cached(() => checkHealth({ env: process.env, redis: redisStatus }), 30_000);

/**
 * For uptime monitors (ADR 0015). 200 while scans can run, even if degraded; 503 when this
 * deployment cannot run scans. Never touches Postgres, Etherscan or the RPC providers.
 */
export async function GET(): Promise<Response> {
  const result = await health();
  return Response.json(result, {
    status: result.status === "down" ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}

export async function HEAD(): Promise<Response> {
  const result = await health();
  return new Response(null, {
    status: result.status === "down" ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
