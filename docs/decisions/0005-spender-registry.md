# 5. Spender registry: who counts as a known app

Date: 2026-10-11

## Status

Accepted

## Context

The approval rules (ADR 0003) warn when an unknown address holds an unlimited approval or an
NFT approval for a whole collection. Until now every spender was "unknown", so a real scan of
an active wallet returned 2,168 warnings, 2,128 of them for the Uniswap V2 and V3 routers. A
warning on everything is no better than no warning.

Two questions decide how we mark a spender "known":

1. **How sure are we that the address belongs to the app?** Contract names on block explorers
   are chosen by whoever deploys the contract, and label lists (Etherscan tags, scraped label
   repositories) are closed, scraped or licensed unclearly. Protocol websites have been
   hijacked before (Curve's front-end DNS in 2022), so a single page is not enough. The same
   address can also be a different contract on another chain: `0x4752…aD24` is Uniswap V2
   Router 02 on Base and Arbitrum but the Uniswap V3 factory on Base Sepolia, and `0xEf1c…BF6B`
   is a Universal Router on Ethereum but a different Uniswap contract on Arbitrum.
2. **Is a genuine app contract free of risk?** No. Users with standing approvals to real,
   well-known contracts have been drained after those contracts were exploited (Multichain
   2022, Transit Swap 2022, Socket 2024, LI.FI 2024). Upgradeable contracts can change under a
   compromised admin key, and retired contracts stop being watched.

## Decision

- A curated registry lives in `packages/registry` (`KNOWN_SPENDERS`, `lookupSpender`).
  `packages/core` stays free of lookups; the chain package turns registry entries into
  `SpenderInfo`.
- **Listing rules.** An entry is one contract at one address on the listed chains. It needs:
  - two or more sources from **two or more of the protocol's own repositories** (docs repo,
    deployment files, SDK constants), each a GitHub permalink **pinned to a commit**, each
    containing the address and tying it to the listed chains;
  - contract code and verified source on every listed chain.

  Explorer names, third-party label lists and single web pages do not qualify. An address
  that fails a check on one chain is listed only for the chains where it passes.
- **Matching is exact**: full address, per chain. A listed address only counts as known if it
  has contract code on that chain.
- **Known lowers the warning, it does not clear the spender.** `reputation: "known"` only
  removes `unlimited-unknown-spender` and `nft-all-unknown-spender`. Every other rule still
  applies, and the best verdict remains "no known risks found" (ADR 0002).
- **Status.** Each entry has `status`:
  - `active`;
  - `deprecated`, only when the protocol has said so, with a `statusNote` link. No rule yet;
    shown as information;
  - `compromised`, when the contract was exploited or taken over, with a `statusNote` link.
    New rule `compromised-spender` (danger), which amends the table in ADR 0003.
- **Checks.** Unit tests (run in CI, offline) enforce checksummed addresses, pinned permalinks
  from two or more repositories, a `statusNote` for non-active entries, and no duplicates.
  `pnpm --filter @plaintx/chain registry:verify` (run by hand, it needs network) checks code,
  verified source and that each pinned source still contains the address.
- Entries are added or changed by pull request only. A reviewer checks the sources by hand for
  the chain context, which the script cannot judge.

## Consequences

- The first version covers Uniswap (Permit2, V2/V3 routers, SwapRouter02, Universal Router
  1.2–2.1.2), CoW Protocol, 0x and OpenSea/Seaport on Ethereum, Base and Arbitrum.
- Left out for now because only one official source was found: 1inch routers, KyberSwap,
  Universal Router 1.0 and 2.2.0. The 0x Exchange Proxy is not listed on Arbitrum because its
  source is not verified there. These stay "unknown" until they meet the rules.
- Keeping the list current is manual work. A new protocol version stays "unknown" until it is
  added, which errs towards warning.
- Marking entries `compromised` depends on us following incidents. A feed or process for that
  is future work.
- Upgradeability (who can change a known contract's code) is not covered here; it is the next
  decision.
