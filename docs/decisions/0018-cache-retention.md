# 18. Cache retention

Date: 2026-11-20

## Status

Accepted. Amends ADR 0010.

## Context

The scan cache (ADR 0010) never deletes anything. Three things make that a problem:

- **Storage:** Neon's free plan holds 0.5 GB per project. ADR 0010 estimated 100,000 wallets
  at "well under 1 GB". That is the right size for a paid plan, but too close to the free
  limit, and busy wallets' histories are much larger than average.
- **Dead rows:** spender facts older than 6 hours and asset details older than 30 days are
  never read again (reads filter by age), but they stay on disk.
- **Privacy:** a scanned wallet's approval history is kept for good. It is public chain data,
  not linked to the visitor, but keeping it longer than useful is still more than we need.

## Decision

- `pruneCache` (`packages/cache/src/prune.ts`) deletes:
  - wallet histories nobody has checked for **90 days** (`HISTORY_RETENTION_DAYS`); the next
    check rebuilds them from scratch;
  - spender facts and asset details past their freshness limits (6 hours and 30 days), which
    reads already ignore.
- Deletes run in batches of 5,000 rows, at most 100 batches per table per run, so locks stay
  short and one run fits its time limit. A run that stops early reports `incomplete`, and the
  next run carries on.
- **Vercel Cron** calls `GET /api/cron/prune` daily at 03:30 UTC (`vercel.json`; the Hobby
  plan allows daily jobs). The route refuses every request without
  `Authorization: Bearer $CRON_SECRET`, compared in constant time. If `CRON_SECRET` is unset or
  shorter than 16 characters, it refuses everyone. `CRON_SECRET` is added to the values the
  Sentry scrubber removes.
- The route opens its own single connection and closes it. It runs once a day, apart from user
  traffic, so it does not share the request pool.
- Failures are logged and sent to Sentry, with the database URL removed.

## Consequences

- A wallet checked again after more than 90 days is scanned from scratch, which is slower and
  uses more Etherscan quota. That is rare, and acceptable.
- The privacy page can promise a limit: histories go after 90 days without a check.
- A new secret, `CRON_SECRET`, must be set in Vercel for Production. Without it the job runs
  but is refused (401 in the logs), and nothing is deleted.
- The risk-address database (ADR 0017) is not touched: its rows are never deleted.
