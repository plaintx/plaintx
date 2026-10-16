# 11. Token and collection details

Date: 2026-10-16

## Status

Accepted

## Context

Scan results showed each approved asset as an address, so a row read "Uniswap can spend all of
this token 0xA0b8…eB48". People recognise "USDC", not addresses, and for a limited approval they
need the amount in the token's own units ("1,500 USDC"), which takes its `decimals`.

Names and symbols come from the token contract itself, so anyone can choose them. Scam tokens
use names that advertise phishing sites ("Claim your reward at usdc-gift.com"), copy well-known
symbols, or hide text with zero-width and right-to-left characters.

## Decision

- `readAssetInfo` in `@plaintx/chain` reads `name()`, `symbol()` and `decimals()` for every
  approved token and NFT collection through Multicall3: one RPC request per 500 assets. Names
  and symbols returned as `bytes32` (MKR, SAI) are read with a second call.
- **Display only.** Asset details never reach `packages/core` and never affect a verdict. A
  fake "USDC" gets exactly the verdict it would get as an address.
- **Untrusted labels are cleaned or dropped.** Control, zero-width and bidi characters are
  removed. A label that is empty, longer than 16 characters (symbols) or 48 (names), or looks
  like a link or domain is dropped rather than cut short, and the app shows the address
  instead. Decimals above 36 are ignored. React escapes everything it renders.
- **Failures never fail the scan.** A missing name only changes what the user sees, unlike a
  missing allowance, which could hide a risk.
- Asset details are cached in Postgres (`asset_info`) for 30 days: decimals never change and
  names rarely do. A contract that answered without usable details is cached as empty, so junk
  tokens are not asked again. A request that failed (network or provider error) is not cached.
- They are read in parallel with the spender step, so they add no step to the progress UI.
- `scanWallet` now returns `{ approvals, assets }`.

## Consequences

- Rows read "Uniswap can spend up to 1,500 USDC" or "can move every NFT you hold in Bored Ape
  Yacht Club". The asset label still links to the explorer, with the address on hover.
- On vitalik.eth (2,201 approvals) all but 4 assets get a label; the 4 return nothing, junk, or
  "vitalik.eth" (dropped as a domain). Cached details add about 10 ms to a repeat scan.
- Legitimate names containing a domain (e.g. "ether.fi ETH") lose their name, but usually keep
  their symbol.
- A lookalike symbol that uses other alphabets (a Cyrillic "С" in "USDС") still shows. The
  verdict is unaffected; detecting lookalikes is future work.
- Deploys must run the migrate command to create `asset_info`. Until then, scans work and log a
  cache warning.
