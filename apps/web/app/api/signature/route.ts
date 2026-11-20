import { MAX_INPUT_LENGTH, TypedDataError } from "@plaintx/core";
import { BusyError } from "@plaintx/limits";
import * as Sentry from "@sentry/nextjs";
import { waitTime } from "@/lib/format";
import { takeSignatureCheck } from "@/lib/limits";
import { runSignatureCheck } from "@/lib/signature";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { request: string } -> { result } with the checked signature request, or { error }.
 * The request is the EIP-712 typed data a wallet was asked to sign. Nothing is signed, stored
 * or logged: the typed data names the user's address. See ADR 0016.
 */
export async function POST(request: Request): Promise<Response> {
  // Refuse oversized bodies before reading them into memory.
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_INPUT_LENGTH * 2)
    return badRequest("That is too long to be a signature request.");
  const body = (await request.json().catch(() => null)) as { request?: unknown } | null;
  const input = typeof body?.request === "string" ? body.request : "";
  if (!input.trim()) return badRequest("Paste the signature request your wallet shows.");

  const waitMs = await takeSignatureCheck(request);
  if (waitMs > 0) {
    const seconds = Math.ceil(waitMs / 1000);
    return Response.json(
      { error: `You've run a lot of checks. Please try again in ${waitTime(seconds)}.` },
      { status: 429, headers: { "retry-after": String(seconds) } },
    );
  }

  try {
    const result = await runSignatureCheck(input);
    return Response.json({ result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof TypedDataError) return badRequest(error.message);
    if (error instanceof BusyError) {
      return Response.json(
        { error: "PlainTx is very busy right now. Please try again in a minute." },
        { status: 503 },
      );
    }
    console.error("Signature check failed:", error instanceof Error ? error.message : error);
    Sentry.captureException(error);
    return Response.json(
      { error: "The check could not finish. The data provider may be busy; please try again." },
      { status: 502 },
    );
  }
}

function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400 });
}
