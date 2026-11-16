import type { BrowserOptions } from "@sentry/nextjs";

/** Public by design: it only lets clients send events. Unset (local, CI): Sentry stays off. */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

/**
 * Errors only, and nothing about the visitor: no IP or user, headers (they carry the IP), cookies,
 * bodies (they carry the scanned address), query strings or local variables (they can hold API
 * keys). Sentry v11 collects all of these unless told not to. See ADR 0014.
 */
export const DATA_COLLECTION: NonNullable<BrowserOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
};
