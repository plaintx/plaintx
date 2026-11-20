# 17. Risk-address database

Date: 2026-11-20

## Status

Accepted. Amends ADR 0008: scam lists can now live in Postgres as well as in the code.

## Context

The bundled scam lists (ADR 0008) are small, old and only change with a deploy. The roadmap
needs our own risk-address data: drainers reported by testers, addresses from incidents we
investigate, and later live feeds whose licences allow it. A new drainer contract that no list
knows yet is the biggest gap in our verdicts. The signature check (ADR 0016) and the approval
check both end in `caution` where a listing would have said `danger`.

The data must:

- change without a deploy, so a reported drainer is flagged within minutes;
- say where every claim came from, and under which licence, since we may later publish it
  through the open API;
- allow mistakes to be corrected without losing the record of what we said;
- cost one query per scan, not one per spender, to serve 100,000 users;
- never pass an address as clean because the database failed.

## Decision

- **Tables in the existing Postgres** (migration 3, `packages/cache`): `risk_sources` holds
  each source's id, name, URL and licence. `risk_addresses` holds one row per chain, address
  and source, with a category (`drainer`, `phishing`, `scam-token`, `exploit` or `other`), a
  short note shown to users, an evidence link, and `retracted_at` / `retraction_note`.
  Addresses are stored lower case, as elsewhere. It shares a database with the scan cache. A
  second database would double the cost and the operations work for a few thousand rows.
  `@plaintx/cache` becomes "Postgres storage" rather than a new package, so all migrations stay
  in one ordered list.
- **Rows are never deleted.** A false positive is retracted with a reason. Re-importing a list
  never revives a retracted row, and the bundled import never overwrites a row.
- **`postgresBlocklist(sql)`** implements the existing `Blocklist` interface and the new
  optional `checkMany`: one indexed query for every spender of a scan. A lookup that fails, or
  takes over 2 seconds, throws. Callers go through `checkAll`, which turns any failure into
  `unavailable` for each address, never `not-listed`.
- **`combineBlocklists`** (`packages/registry`) merges lists. An address is listed if any list
  names it, with every list's match; otherwise unavailable if any list failed; otherwise not
  listed. The web app uses the bundled lists plus the database. When the database is down,
  bundled matches still count, and the other spenders get the existing
  `blocklist-unavailable` caution.
- **`readSpenderInfo` makes one `checkAll` call** for all spenders instead of one `check` per
  spender. This serves both the wallet scan and the signature check.
- **Outages** are reported to Sentry once per outage, not per request, as Redis outages are
  (ADR 0014).
- **Admin CLI** (`pnpm --filter @plaintx/cache risk …`): `stats`, `import-bundled`, `source`,
  `add`, `retract` and `check`. There is no admin web page yet. A page would need
  authentication, which is a decision of its own.
- **The bundled lists stay in the code** as a baseline that works without the database.
  `import-bundled` copies them into the database for when we stop shipping them in the code.
  It is not run on deploy.

## Consequences

- Adding a reported drainer is one CLI command against the production `DATABASE_URL`. It takes
  effect on the next scan, with no deploy and no cache to clear: listings are never cached.
- A database outage now changes verdicts: spenders that would show "no known risks" show
  `blocklist-unavailable` instead. This is deliberate. The health check still reports the
  database only as "configured" (ADR 0015) and does not query it, to keep Neon's free tier.
  Sentry carries the outage.
- Every scan makes one more query, on a primary-key index. Neon's compute is already awake
  for the scan cache.
- Data we add ourselves needs its own source row, such as `plaintx-reports` with licence
  "own data". If we later publish the data, we need a licence for it, probably CC0 or
  ODbL. That is a separate decision.
- Taking data from testers or the public needs a review process, so the list cannot be used to
  smear honest addresses. Until that exists, only maintainers add entries, each with evidence.
