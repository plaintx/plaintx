# 13. Deployment on Vercel, with Neon and Upstash

Date: 2026-10-18

## Status

Accepted

## Context

PlainTx needs a public deployment at plaintx.app for its first testers, then for many more
users. The web app is a Next.js app whose `/api/scan` streams for up to five minutes, and it
needs Postgres (scan cache, ADR 0010) and Redis (rate limits, ADR 0012).

The project has no funding yet, so launch should cost nothing, without choices we would have
to undo later. It is also a wallet-safety tool: a script injected into its page could show a
user a fake verdict or a malicious transaction to sign.

## Decision

- **Vercel** hosts `apps/web` (project root directory `apps/web`), with **Neon** Postgres and
  **Upstash** Redis added through the Vercel Marketplace, all in Frankfurt (`fra1`, AWS
  `eu-central-1`) so the app and its stores are close and data stays in the EU. Free tiers
  (Vercel Hobby, Neon Free, Upstash Free) cover testers; each plan can be upgraded in place.
- **Builds** (`apps/web/vercel.json`) build the workspace packages the app depends on, apply
  database migrations, then build the app. A failed migration fails the deploy, so code never
  runs against a schema it does not expect. Migrations stay additive (ADR 0010), and Preview
  deployments must use their own Neon branch, never the production database.
- **pnpm** comes from the root `packageManager` field through Corepack
  (`ENABLE_EXPERIMENTAL_COREPACK=1` in the Vercel project).
- **Client IPs:** Vercel replaces `X-Forwarded-For` with the connecting client's address, so
  `TRUSTED_PROXY_COUNT=1`. Cloudflare serves DNS only for plaintx.app (no proxying), so Vercel
  sees real client addresses.
- **Strict Content-Security-Policy** on every page (`apps/web/proxy.ts`): scripts and styles
  run only with a fresh per-request nonce, and the page may fetch only our own API and the
  wallet chains' public RPCs. Pages are therefore rendered per request instead of statically,
  which costs little for a single page and is what makes the nonce possible. Other security
  headers (HSTS, nosniff, frame denial, referrer and permissions policies) are set for every
  response in `next.config.ts`.
- **Chains we cannot scan yet** are listed as "coming soon" and refused by the API
  (`scannable` in `CHAIN_OPTIONS`). Base is off until we have an Etherscan plan that covers it.

## Consequences

- Launch costs nothing beyond the domain. Vercel Hobby is for non-commercial use: we move to
  Pro before PlainTx earns money or is run by a company.
- Free-tier quotas (Etherscan, Alchemy, Neon, Upstash) cap what testers can do. Rate limiting
  keeps one client from using them up.
- The five-minute function limit caps the largest first scans. Background jobs for those are
  later work, and may move scanning off Vercel functions.
- Per-request rendering means the page is not served from Vercel's CDN cache. Static assets
  still are.
- Adding a third-party script or API to the page means adding its origin to the CSP.
