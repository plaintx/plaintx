# 10. Scan cache in Postgres

Date: 2026-10-12

## Status

Accepted

## Context

PlainTx is designed to serve 100,000 users reliably. A full scan of a large wallet (vitalik.eth:
about 2,200 approvals) takes about 19 seconds. Most of that time goes on Etherscan, which allows
about 5 requests a second: walking the wallet's whole approval history, then checking each
spender's verification. Repeating that work for every scan of the same wallet or spender would
exhaust our API quotas long before that scale. Live allowance reads are cheap since they moved
to Multicall3 (about 5 RPC requests for 2,200 approvals).

At that scale the app runs on several servers, so an in-process cache would be duplicated on
each and lost on every deploy.

## Decision

- Scans cache their slow inputs behind a `ScanCache` interface in `@plaintx/chain`.
  `@plaintx/cache` implements it on Postgres; `memoryCache()` serves tests and CLIs.
- **Wallet history** (every token/spender pair the wallet has approved) is cached with the block
  it was searched up to. The next scan searches only from that block minus `RESCAN_BLOCKS`
  (10,000), which covers reorgs and Etherscan lagging behind our RPC node. Etherscan charges per
  request, not per block range, so the overlap is free. A pair is never removed: whether it is
  still active is decided by the live read.
- **Spender facts** from the chain (has code, verified source, proxy and upgrade controller) are
  cached for 6 hours. A proxy admin handover then shows up the same day. A verification
  Etherscan could not answer ("unknown") is not cached.
- **Never cached:** live allowances, the known-app registry and the scam lists. They are applied
  fresh on every scan, so verdicts reflect the chain as it is now and list updates take effect
  immediately.
- **A failing cache is skipped, never trusted.** If Postgres is down, scans run uncached and the
  error is logged with the database URL redacted.
- The cache holds only public chain data keyed by chain and address. It stores no IP addresses,
  sessions or anything else that links a scan to a person.
- Schema changes are numbered migrations applied by `pnpm --filter @plaintx/cache migrate`,
  under a Postgres advisory lock so parallel deploys apply them once.
- Local development uses `docker-compose.yml` (postgres:18.6-alpine); CI runs the cache tests
  against the same image.

## Consequences

- Repeat scans of vitalik.eth take 1.8 s instead of 19 s, with identical results.
- Storage is small: a few hundred bytes per spender and roughly 150 bytes per approval pair, so
  100,000 wallets fit well under 1 GB.
- The first scan of a large wallet is still slow. Progress updates in the UI, and possibly
  background jobs for very large wallets, are the next step.
- Deploys must run the migrate command before starting the web app. Without it, scans still
  work but uncached, with a warning in the logs.
- Two simultaneous scans of the same wallet both write its history; the last write wins.
  Both contain every pair, so nothing is lost.
