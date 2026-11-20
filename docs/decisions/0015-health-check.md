# 15. Health check endpoint

Date: 2026-11-19

## Status

Accepted

## Context

plaintx.app needs an uptime monitor that emails admin@plaintx.app when the site cannot serve
scans. Pinging the home page shows that Vercel answers, but not that a deployment has the keys a
scan needs, or that the shared rate limits work.

The obvious health check, querying every dependency, would cost us on the free tiers we run on
(ADR 0013):

- **Neon** suspends the database after about five minutes idle and bills compute while it is
  awake. A monitor querying it every few minutes would keep it awake around the clock and use
  more compute hours than the free plan has.
- **Etherscan and Alchemy** calls use the daily quotas real scans need.
- The endpoint is public. If every request reached Redis, anyone could spend our Upstash command
  quota by calling it in a loop.

The app is already built to keep working when Postgres or Redis fail: a failing cache only makes
scans slower (ADR 0010), and limits fall back to each server (ADR 0012).

## Decision

- `GET /api/health` (and `HEAD`) returns JSON: `status` (`ok`, `degraded` or `down`), one entry
  per check, and the deployment's short commit hash.
- **`down` (HTTP 503)** only when this deployment cannot run scans: the Etherscan key or the RPC
  URL of a scannable chain is missing. Otherwise 200, so a monitor alerts on real outages only.
- **`degraded` (HTTP 200)** when Redis does not answer or is not configured, or no database is
  configured. Scans still work. Redis outages already reach Sentry (ADR 0014).
- **Redis** is checked with a PING, at most once every 30 seconds per server, whatever the
  traffic. Concurrent requests share one check.
- **Postgres is not queried**, only checked to be configured, so the monitor never wakes Neon.
  Cache failures show up as warnings in the function logs.
- **No upstream calls** to Etherscan or the RPC providers.
- **Nothing sensitive in the response:** no variable names, hosts or error messages, so it is
  safe to be public.

## Consequences

- A database outage does not fail the health check. Scans keep working without the cache, but
  slower and using more provider quota. If that becomes a real risk, cache errors should be
  reported to Sentry (once per outage, like Redis) rather than checked by polling.
- Provider outages (Etherscan, Alchemy) show up as failed scans in Sentry, not here.
- The uptime monitor should check `/api/health` for a 200 every 5 minutes. That keeps Vercel
  function use and Upstash commands well inside the free tiers.
