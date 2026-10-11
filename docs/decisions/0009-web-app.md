# 9. Web app

Date: 2026-10-11

## Status

Accepted

## Context

Milestone 1 needs a page where anyone can check a wallet and revoke risky approvals. The scan
uses API keys (Etherscan, Alchemy) that must not reach browsers, and revoking must happen in
the user's own wallet (ADR 0007).

## Decision

- `apps/web` is a Next.js app (App Router) styled with Tailwind.
- **Scans run on the server.** `POST /api/scan { address, chain }` calls `scanWallet` and returns
  JSON rows that already include each approval's unsigned revoke transaction. API keys come
  from the root `.env` and stay on the server; errors are redacted before logging and never
  include provider URLs.
- **Revokes run in the browser** through wagmi with injected wallets only (MetaMask, Rabby and
  others). The button asks for the scanned wallet and its network before sending. Public RPCs
  are used only to watch for receipts. WalletConnect (phone wallets) needs a project ID and is
  left for later.
- Wording follows ADR 0002: "No known risks found" is shown in grey, never as "safe".
- New dependencies are pinned to exact versions at least two weeks old when added.

## Consequences

- Big wallets take minutes until scans are cached; the page shows elapsed time meanwhile.
- Etherscan's free plan does not cover Base (confirmed 2026-10-11), so Base scans return a
  clear "not available yet" message until we use a paid plan or another log source.
- Token names and amounts are not shown yet (only addresses and limited/unlimited); fetching
  token metadata belongs with the performance work.
- `/api/scan` has no rate limiting or auth yet: it must get both before public deployment, or
  anyone could use up our API quotas.
