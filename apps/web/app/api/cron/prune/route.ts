import { pruneCache } from "@plaintx/cache";
import * as Sentry from "@sentry/nextjs";
import postgres from "postgres";
import { isCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily cache clean-up (ADR 0018), called by Vercel Cron (`vercel.json`) with CRON_SECRET.
 * Uses its own short-lived connection: it runs once a day, apart from user traffic.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request, process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.DATABASE_URL;
  if (!url) return Response.json({ skipped: "DATABASE_URL is not set" });

  const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    const result = await pruneCache(sql);
    console.info("Cache pruned:", JSON.stringify(result));
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = String(error).replaceAll(url, "<DATABASE_URL>");
    console.error("Cache pruning failed:", message);
    Sentry.captureException(new Error(`Cache pruning failed: ${message}`));
    return Response.json({ error: "Pruning failed" }, { status: 500 });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
