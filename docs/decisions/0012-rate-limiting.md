# 12. Rate limiting with Redis

Date: 2026-10-16

## Status

Accepted

## Context

`/api/scan` is public and each scan spends our provider quotas: a large wallet's first scan
makes hundreds of Etherscan calls. Nothing stopped one client from running scans in a loop and
using up the quota for everyone.

Etherscan also limits us: about 5 calls a second per API key (free tier), shared by every server
using that key. Each server spaced its own calls, so two servers together could go over the
limit, and calls made at the same moment by one server could too.

PlainTx is designed for 100,000 users on several servers, so limits must be shared between
servers and cost almost nothing per request.

## Decision

- Limits go through a `RateLimiter` interface in a new package, `@plaintx/limits`. It is
  implemented on Redis, with `memoryRateLimiter()` for tests, CLIs and as a fallback.
- **Redis**, not Postgres: a limit check runs on every request and the data is short-lived. One
  in-memory script call takes well under a millisecond and keeps load off the database that
  holds the scan cache. We use the official client, `@redis/client`.
- **One algorithm (GCRA) for both limits**, each one atomic Lua script that stores a single time
  per key and lets the key expire with it. Scripts use Redis's clock, so servers whose clocks
  drift still agree.
- **Scans per client:** 10 at once, then one a minute (`SCAN_RULE`). A refused scan gets a 429
  with `Retry-After` and a message saying how long to wait. It is checked after input
  validation, so a typo costs nothing.
- **Clients are identified by IP address**, read from `X-Forwarded-For` by counting
  `TRUSTED_PROXY_COUNT` entries in from the right, because entries further left can be forged.
  IPv6 clients are limited per /64. Production must run behind a proxy; with no proxy a client
  can choose its own key, and the app warns at startup.
- **Etherscan budget shared by every server:** before each call, a server books the next slot
  in a queue kept in Redis per API key (`ETHERSCAN_CALLS_PER_SECOND`, 10% margin). If the wait
  would be over 30 seconds the call gives up with `BusyError`. History then fails the scan with
  "PlainTx is very busy right now". A verification check reports "unknown", which is not cached.
  Redis keys use a hash of the API key, never the key itself.
- **Redis being down never blocks scans.** Calls fail fast (offline queue disabled, 500 ms
  timeout) and each server enforces the same limits on its own until Redis is back. The switch
  is logged once each way.
- Redis holds only counters: client IPs for at most 10 minutes, nothing persisted to disk.
  Local development and CI use `redis:8.10.2-alpine`.

## Consequences

- One client can no longer use up the scan quota for everyone, and Etherscan's per-second limit
  holds however many servers we run.
- Etherscan's limit still caps us at about 5 calls a second in total. At scale, first scans of
  large wallets will queue and some will be refused as busy. The fix is a paid Etherscan plan
  (raise `ETHERSCAN_CALLS_PER_SECOND`) and our own indexed data, not more servers.
- Clients behind one shared IP (offices, mobile carriers) share a limit. 10 at once is generous
  for one person; we will watch 429 rates after launch.
- Deploys need a Redis (or compatible) service, `REDIS_URL` and the right `TRUSTED_PROXY_COUNT`.
- Not yet limited: concurrent scans per client and the RPC provider's quota. Multicall keeps RPC
  use low (about 5 requests per 2,200 approvals), so Etherscan is the binding limit today.
