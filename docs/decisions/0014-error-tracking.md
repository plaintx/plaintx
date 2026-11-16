# 14. Error tracking with Sentry

Date: 2026-11-16

## Status

Accepted

## Context

Since plaintx.app went live (ADR 0013), failures appear only in Vercel's function logs, which
nobody watches and which the Hobby plan keeps for a short time. With testers arriving, we need to
hear about errors in the server and in the browser before users report them, with stack traces
we can read.

PlainTx is a privacy-sensitive wallet-safety tool. An error report must never link a person to
the wallet they scanned, and must never carry our provider keys: the RPC URLs contain Alchemy
keys, and errors from viem or Etherscan can quote them. The page also runs under a strict CSP
that allows fetches only to our own origin and the chains' RPCs.

## Decision

- **Sentry** (`@sentry/nextjs`), in its **EU (Germany) region**, on the free plan, with an
  account owned by admin@plaintx.app. It is the standard for Next.js, supports Next's
  `instrumentation` hooks, and keeps data in the EU, like the rest of the stack.
- **Errors only.** No performance tracing, session replay or profiling: they collect far more
  about visitors than we need, and they use up free-tier quota.
- **No visitor data** (`apps/web/lib/sentry.ts`): `dataCollection` turns off user and IP data,
  cookies, headers (which carry the IP), request bodies (which carry the scanned address),
  query strings, database query data and local variables. Sentry v11 collects these by default,
  so the list is explicit.
- **Secrets scrubbed on the server** (`apps/web/lib/redact.ts`): before an event is sent,
  `beforeSend` replaces every secret environment value, and every key-like part of a secret
  URL, with `<redacted>`. This covers an error message that quotes a key without its URL.
- **Tunnel route:** the browser sends events to `/monitoring` on our own origin, which forwards
  them to Sentry. The CSP stays unchanged, and ad blockers do not drop error reports.
  `apps/web/proxy.ts` skips that path, since it runs no scripts.
- **What gets reported:** errors no route caught (`onRequestError`), a root layout that fails
  (`app/global-error.tsx`), failed scans in `/api/scan`, and Redis outages in rate limiting
  (once per outage, not per request). Expected outcomes such as "chain not supported" and
  "busy" are not reported.
- **Source maps** are uploaded at build time when `SENTRY_AUTH_TOKEN` is set, then deleted from
  the build, so traces are readable but our source maps are not published.
- **Off by default:** without `NEXT_PUBLIC_SENTRY_DSN` (local development, CI), Sentry does not
  start.

## Consequences

- A new secret environment variable must be added to `SECRET_ENV` in `apps/web/lib/redact.ts`,
  or Sentry may receive it in an error message.
- `NEXT_PUBLIC_SENTRY_DSN` is built into the browser bundle, so changing it needs a new
  deployment. The DSN is public by design: it only lets clients send events.
- The free plan's monthly event quota caps what we see during a flood of errors. Reports past
  the quota are dropped, and the site keeps working.
- Events carry no IP or user, so Sentry cannot tell us how many people an error affected, only
  how often it happened.
- Every tunnelled browser event is a function call on Vercel, counted against the Hobby quota.
