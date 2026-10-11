# 8. Scam blocklist

Date: 2026-10-11

## Status

Accepted

## Context

The `malicious-spender` rule (ADR 0003) never fired: nothing marked a spender "malicious".
Open scam lists differ in license, freshness and provenance (checked 2026-10-11):

| List                         | License | Addresses | Freshness          |
| ---------------------------- | ------- | --------- | ------------------ |
| ScamSniffer scam-database    | GPL-3.0 | 2,530     | current, 7-day lag |
| Forta labelled datasets      | MIT     | ~15,000   | last update 2023   |
| MyEtherWallet darklist       | MIT     | 715       | mostly 2017–2020   |
| MetaMask eth-phishing-detect | DBAD    | domains   | current            |

GPL data cannot be bundled in an MIT project, and CI rejects GPL dependencies. Nearly all
Forta entries are Etherscan labels (directly or via Luabase), whose terms we have not cleared.
Drainers deploy new contracts daily, so any static list is only a baseline.

## Decision

- Bundle the MyEtherWallet darklist and the Forta rows with a public, non-Etherscan source
  (DeFiHackLabs, evil-jar, Defi-Hack-Analysis-POC): 668 unique Ethereum addresses. Their MIT
  notices are kept in `packages/registry/THIRD_PARTY_NOTICES.md`.
- `scripts/build-blocklist.mjs` regenerates `src/blocklist-data.ts` from pinned commits, so the
  data is reproducible and every update is a reviewable diff.
- Every source sits behind one interface, `Blocklist.check(chainId, address)`, which returns
  `listed` (with each list's name and note), `not-listed` or `unavailable`. The bundled lists
  are one implementation; a live service becomes another, plugged into `scanWallet`.
- A listed spender becomes `malicious`, even if it is in the known-app registry: a false
  alarm is cheaper than a missed drainer. A test fails if the bundled data and the registry
  ever overlap, so such a clash gets reviewed.
- `unavailable`, or a blocklist that throws, is never treated as clean: the spender gets
  `blocklistUnavailable` and the new rule `blocklist-unavailable` (caution). This amends the
  table in ADR 0003.
- The bundled lists apply to Ethereum only, which is what they cover.

## Consequences

- Coverage is small and old. Fresh data needs ScamSniffer's permission or API, or another
  live service; that is the next step for this feature.
- Address lists catch reused drainer contracts and scammer wallets, not new ones. Approvals to
  personal wallets are already flagged by `spender-is-wallet`.
- Phishing *domains* (MetaMask, ScamSniffer) are for the link checker, a later milestone.
