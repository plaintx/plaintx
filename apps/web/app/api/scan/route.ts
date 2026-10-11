import { type ChainName, UnsupportedChainError } from "@plaintx/chain";
import { isAddress } from "viem";
import { runScan } from "@/lib/scan";
import { CHAIN_OPTIONS } from "@/lib/types";

export const runtime = "nodejs";
// Large wallets take minutes until scans are cached (next milestone).
export const maxDuration = 300;

/** POST { address, chain } -> ScanResult. Only reads public chain data; nothing is signed. */
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

  try {
    return Response.json(await runScan(address, chain.name as ChainName));
  } catch (error) {
    if (error instanceof UnsupportedChainError) {
      return Response.json(
        {
          error: `${chain.label} isn't available yet: our data provider's current plan doesn't cover it.`,
        },
        { status: 503 },
      );
    }
    console.error("Scan failed:", error instanceof Error ? error.message : error);
    return Response.json(
      { error: "The scan could not finish. The data provider may be busy; please try again." },
      { status: 502 },
    );
  }
}
