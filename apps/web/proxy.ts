import { type NextRequest, NextResponse } from "next/server";
import { contentSecurityPolicy, rpcOrigins } from "@/lib/csp";
import { WALLET_CHAINS } from "@/lib/wallet-chains";

const connect = rpcOrigins(WALLET_CHAINS);

/**
 * Gives each page request a fresh nonce and a strict Content-Security-Policy. Next.js reads the
 * nonce from the request's policy and adds it to its own scripts and styles. See ADR 0013.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV === "development",
    connect,
  });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API responses and static files run no scripts.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
