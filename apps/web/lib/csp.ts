/**
 * The Content-Security-Policy for pages. Scripts and styles run only with this request's nonce,
 * so injected markup cannot run code, and the page may only call our own API and the wallet
 * chains' public RPCs. See ADR 0013.
 */
export function contentSecurityPolicy({
  nonce,
  dev,
  connect,
}: {
  nonce: string;
  /** `next dev` needs eval and inline styles for its error overlay and hot reload. */
  dev: boolean;
  /** Origins besides our own that the page may fetch from. */
  connect: readonly string[];
}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    ["connect-src 'self'", ...connect].join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** The origins of each chain's default public RPCs, without duplicates. */
export function rpcOrigins(
  chains: readonly { rpcUrls: { default: { http: readonly string[] } } }[],
): string[] {
  return [...new Set(chains.flatMap((c) => c.rpcUrls.default.http.map((u) => new URL(u).origin)))];
}
