# 16. Signature explainer

Date: 2026-11-20

## Status

Accepted

## Context

Milestone 2 is the transaction and signature explainer. Signatures come first. Most drainer
losses today start with an off-chain signature, not a transaction. Permit, Permit2 and fake
Seaport listings let a scammer take tokens or NFTs without the victim ever sending a
transaction. Wallets show these requests as walls of JSON, which people sign without reading.

Full transaction simulation needs a fork node (Anvil) and more infrastructure. Signatures can be
decoded and checked with the facts we already have: the spender registry (ADR 0005), scam lists
(ADR 0008), and contract code and verification (ADRs 0004 and 0006).

## Decision

- **Input:** EIP-712 typed data (`eth_signTypedData_v4`). We accept the object, the same object
  JSON-encoded a second time, the `[account, typedData]` params, or the whole JSON-RPC request.
  `parseTypedData` (`packages/core/src/typed-data.ts`) checks every value against its declared
  type. Integers become bigints, addresses are checksummed, and bytes are checked for length.
  Anything malformed is refused with a message for the user. Input over 100 kB, nesting deeper
  than 8 levels and arrays over 200 items are refused, so hostile input cannot use up our CPU.
- **Decoding** (`decodeSignature`, `packages/core/src/signature.ts`) recognizes requests by their
  exact struct names and fields:
  - EIP-2612 `Permit` and DAI's `Permit` (`allowed: true` means unlimited; `expiry: 0` means
    never)
  - Permit2 `PermitSingle` and `PermitBatch` (allowances)
  - Permit2 `PermitTransferFrom` and `PermitBatchTransferFrom`, with or without a witness
    (one-time transfers, such as UniswapX orders)
  - Seaport `OrderComponents` and `BulkOrder`

  Struct names are part of the hash a contract checks. A request that renames them could not
  be used against the real contract, so exact matching is safe against look-alikes. Anything
  else is `unknown`.
- **Parties** (`partiesOf`) are the addresses a request hands power or assets to: the spender,
  the verifying contract, Seaport payment recipients other than the signer, and the Seaport
  zone. For unknown requests, these are the verifying contract and up to 10 addresses found in
  the message. The signer is never a party. Each party gets the same lookups as an approval's
  spender: `readSpenderInfo` checks the scam lists, the registry, contract code, verified
  source and upgradeability. The results share the scan cache.
- **Rules** (`assessSignature`), deterministic and with no network access:

  | Finding id                                    | Level   | When                                                                  |
  | --------------------------------------------- | ------- | --------------------------------------------------------------------- |
  | `malicious-<role>`                            | danger  | Any party is on a scam list                                           |
  | `spender-is-wallet`                           | danger  | Permit or Permit2 spender has no code                                 |
  | `compromised-spender`                         | danger  | Registry marks the spender compromised                                |
  | `seaport-nothing-back`                        | danger  | An order gives items and pays the signer nothing                      |
  | `unverified-spender`                          | caution | Spender contract's source is not verified                             |
  | `upgradeable-single-key`                      | caution | Spender's code can be swapped by one key                              |
  | `unknown-spender`                             | caution | Spender is not in the registry (wording says if unlimited or one-off) |
  | `unofficial-permit2`                          | caution | Permit2-shaped request for a contract other than Permit2              |
  | `permit2-long-expiry`                         | caution | Permit2 allowance lasts over 365 days                                 |
  | `unknown-marketplace`                         | caution | Seaport order for a contract not in the registry                      |
  | `seaport-any-item`                            | caution | Offer uses criteria: any item from a collection                       |
  | `seaport-long-listing`                        | caution | Order open for over 365 days                                          |
  | `unrecognized-signature`                      | caution | We cannot decode the request                                          |
  | `unchecked-network` / `blocklist-unavailable` | caution | We could not check the chain or a scam list                           |

  At most 12 parties are looked up per request (`MAX_CHECKED_PARTIES`), spender and contract
  first, because each lookup costs RPC and Etherscan calls and a crafted bulk order could name
  hundreds. Any left unchecked raise `unchecked-addresses` (caution).

  A permit that only sets amounts to zero raises no spender findings: it removes a permission.
  Unlike approvals, any permit to an unknown spender is a caution, limited or not. A signature
  request is the moment of greatest risk, and the user can still say no.
- **Chains:** requests name their chain in the domain. We check Ethereum and Arbitrum, the
  chains we scan. Requests for other chains are decoded and explained, but their addresses are
  not checked, and the verdict says so.
- **Explanation:** `apps/web/lib/signature-view.ts` turns the report into plain-English lines,
  such as "Uniswap Universal Router 2.0 could spend up to 100 USDC through Permit2, until …".
  These lines are built from the decoded request and display-only token names. They never
  change the verdict. No LLM is involved.
- **API:** `POST /api/signature { request }` returns JSON. It is rate limited per client at 20
  checks, then one every 30 seconds (`SIGNATURE_RULE`), in Redis like scans (ADR 0012). The
  typed data names the user's address, so it is never stored, cached or logged. Sentry already
  drops request bodies (ADR 0014).
- **UI:** a "Check a signature" tab beside the wallet health check, linkable as `/#signature`,
  with two built-in examples: a real Uniswap Permit2 request and a fake NFT listing.

## Consequences

- Users must copy the request out of their wallet. Most wallets hide the raw JSON or make it
  hard to copy, so this tool mostly serves careful users and support staff until the browser
  extension (milestone 4) can read requests directly. The decoder and rules are built to be
  reused there unchanged.
- `personal_sign` messages (such as Sign-In with Ethereum) and transactions are not covered yet.
  Transactions need simulation, the next part of milestone 2.
- We do not price Seaport orders. A listing at a fraction of its value gets no finding unless
  the signer receives nothing. Pricing needs a price source we trust, which is a decision of its
  own.
- An unknown spender with verified code and a limited amount gets only a caution. A new drainer
  contract that no scam list knows yet looks the same as a new honest app. Our own risk-address
  database (next on the roadmap) is what closes that gap.
- New request shapes need a new decoder, tests with a real sample, and an update to this ADR.
