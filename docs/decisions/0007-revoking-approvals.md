# 7. Revoking approvals

Date: 2026-10-11

## Status

Accepted

## Context

The health check's main action is "revoke": remove a permission the user no longer wants.
PlainTx is non-custodial and must never hold, request or use private keys or seed phrases.
Only the wallet that granted an approval can remove it.

## Decision

- `revokeTransaction(approval)` in `packages/core` returns an unsigned transaction
  `{ chainId, to, data }`. It is pure: no network access, no signing.
- The app hands that transaction to the user's own wallet, which shows it and asks the user to
  confirm and pay gas. PlainTx never signs or sends anything itself.
- One transaction per approval:
  - ERC-20: `approve(spender, 0)` on the token;
  - NFT collection: `setApprovalForAll(spender, false)` on the collection;
  - Permit2: `lockdown([{ token, spender }])` on Permit2, which zeroes the allowance and
    exists for this purpose.
- Permit2 moves into `packages/core` as `PERMIT2`, since both scanning and revoking need it.

## Consequences

- Each revoke costs the user a small gas fee and one wallet confirmation. A live simulation
  on Ethereum (2026-10-11) took an unlimited ERC-20 and an unlimited Permit2 allowance to zero
  at about 29k and 30k gas.
- Revoking the ERC-20 approval *to Permit2* ends every Permit2 allowance for that token at
  once; the UI can offer this as a shortcut.
- Batching several Permit2 revokes into one `lockdown` call, or several revokes into one
  transaction via smart-wallet batching (EIP-5792), is future work.
- A non-standard token that rejects `approve(spender, 0)` cannot be revoked this way; the
  wallet's own simulation will show the failure before the user pays.
