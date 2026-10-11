# 3. Approval risk rules

Date: 2026-10-11

## Status

Accepted. Amended by ADR 0005 (adds the `compromised-spender` rule).

## Context

The wallet health check (milestone 1) lists a wallet's standing approvals and ranks them by risk
so users know what to revoke first. Approvals are where most drainer losses start: the theft
happens later, when the spender uses a permission the user gave earlier.

We cover three kinds: ERC-20 `approve`, NFT `setApprovalForAll`, and Uniswap Permit2 allowances.

## Decision

`assessApproval` in `packages/core/src/approvals.ts` applies these rules:

| Finding id                  | Level   | When                                                          |
| --------------------------- | ------- | ------------------------------------------------------------- |
| `malicious-spender`         | danger  | Spender is on a curated scam/drainer list                     |
| `spender-is-wallet`         | danger  | Spender has no code (EOA); legitimate apps are contracts      |
| `unverified-spender`        | caution | Spender is a contract confirmed to have no verified source    |
| `unlimited-unknown-spender` | caution | ERC-20/Permit2 amount >= 2^128 and spender reputation unknown |
| `nft-all-unknown-spender`   | caution | `setApprovalForAll` to a spender with unknown reputation      |
| `permit2-long-expiry`       | caution | Permit2 expiration more than 365 days from now                |

- Zero allowances and expired Permit2 approvals produce no findings: they can no longer move
  anything.
- Spender facts (reputation, `isContract`, `verified`) are inputs. The core does no lookups, so
  results depend only on inputs and the `now` timestamp.
- `rankApprovals` orders by verdict level, then by number of findings.
- Unlimited approvals to known apps are not flagged; they are normal practice and flagging them
  would bury real risks.
- Stale approvals (unused for a long time) are not a finding for now. With only `danger` and
  `caution` available, flagging them would mark most older wallets as `caution`. We may show
  "last used" as information that does not affect the verdict.

## Consequences

Verdict quality depends on the reputation data supplied. An unknown malicious spender with a
verified contract and a bounded allowance yields `no_known_risks`, which is why the wording
matters (see ADR 0002). Thresholds are constants (`UNLIMITED_THRESHOLD`,
`LONG_EXPIRY_SECONDS`) and changes to them or to the rules need a new or updated ADR.
