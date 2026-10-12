import { type ChainName, UnsupportedChainError } from "@plaintx/chain";
import { isAddress } from "viem";
import { runScan } from "@/lib/scan";
import { CHAIN_OPTIONS, type ChainOption, type ScanEvent } from "@/lib/types";

export const runtime = "nodejs";
// A large wallet's first scan can take minutes. Repeat scans are cached (ADR 0010).
export const maxDuration = 300;

/**
 * POST { address, chain } -> newline-delimited ScanEvents: progress while the scan runs, then
 * the result or an error. Bad input is still a plain 400. Only reads public chain data; nothing
 * is signed.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    address?: unknown;
    chain?: unknown;
  } | null;
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const chain = CHAIN_OPTIONS.find((c) => c.name === body?.chain);
  if (!isAddress(address) || !chain) {
    return Response.json(
      { error: "Enter a valid wallet address and pick a chain." },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ScanEvent) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const result = await runScan(address, chain.name as ChainName, (progress) =>
          send({ type: "progress", progress }),
        );
        send({ type: "result", result });
      } catch (error) {
        send({ type: "error", error: errorMessage(error, chain) });
      }
      if (open) controller.close();
    },
    // The browser left. The scan runs to the end so its results still reach the cache.
    cancel() {
      open = false;
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // Stops proxies such as nginx from holding progress back until the scan ends.
      "x-accel-buffering": "no",
    },
  });
}

/** What the user sees when a scan fails. Details stay in the server log. */
function errorMessage(error: unknown, chain: ChainOption): string {
  if (error instanceof UnsupportedChainError) {
    return `${chain.label} isn't available yet: our data provider's current plan doesn't cover it.`;
  }
  console.error("Scan failed:", error instanceof Error ? error.message : error);
  return "The scan could not finish. The data provider may be busy; please try again.";
}
