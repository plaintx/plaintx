# 4. Chain data providers

Date: 2026-10-11

## Status

Accepted

## Context

The wallet health check needs (a) every token/spender pair a wallet has ever approved, which
means searching event logs across the chain's full history, and (b) the current value of each
approval and facts about each spender.

Alchemy's free tier limits `eth_getLogs` to a 10-block range, which makes full-history scans
impractical; its pay-as-you-go plan lifts this but costs money before we have funding. Public
RPCs are unreliable for large log queries.

## Decision

- **History:** Etherscan API v2 `logs/getLogs`, searched by topic (event signature + owner),
  paged forward by block number. One free key covers all chains (5 calls/s, 100k/day).
- **Verification:** Etherscan `contract/getsourcecode`.
- **Current state:** a standard RPC endpoint (Alchemy free tier) through viem: `allowance`,
  `isApprovedForAll`, Permit2 `allowance`, `getCode`.
- Provider code lives in `packages/chain` behind small interfaces (`Etherscan`, `ChainReader`)
  so a provider can be swapped by adding an adapter.

## Consequences

- Some chains are not on Etherscan's free tier; there, discovery fails and must use a paid key
  or another log source. Verification falls back to `"unknown"`, which raises no finding.
- Scans are rate-limited by Etherscan; a busy service will need a paid plan or our own indexer.
- Single-token ERC-721 `approve` is not covered yet; only `setApprovalForAll`.
