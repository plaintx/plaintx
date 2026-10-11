# Architecture

> Living document. Update it when the shape of the system changes.

## Overview

```
input (tx / signature / address / link)
      │
      ▼
packages/core  ── deterministic checks ──► Verdict { level, findings }
      │                                         │
      │ (fork simulation via Anvil, decoding)   ▼
      │                                  explainer (LLM): plain-English text only
      ▼
apps/web, apps/extension, public API
```

## Components

| Component           | Status  | Purpose                                                |
| ------------------- | ------- | ------------------------------------------------------ |
| `packages/core`     | started | Verdict model and deterministic risk checks            |
| `packages/chain`    | started | Reads approvals and spender facts from chain data      |
| `packages/registry` | started | Curated, source-linked list of known app contracts     |
| `apps/web`          | planned | Next.js app: wallet health check, paste-and-check UI   |
| `apps/extension`    | planned | Browser extension that checks requests before signing  |
| Simulation          | planned | Foundry Anvil forks to preview a transaction's effects |
| Storage             | planned | Postgres for known-bad lists and cached results        |

## Chains

Ethereum, Base and Arbitrum first, via viem.

## Data providers

See ADR 0004. Etherscan API v2 finds a wallet's approval history (event logs) and contract
verification; an RPC endpoint (Alchemy) reads current state. `packages/core` never does I/O:
`packages/chain` gathers facts and passes them in.

## Spender reputation

See ADR 0005. `packages/registry` lists known app contracts per chain, each backed by pinned
sources from two or more of the protocol's own repositories. "Known" only removes the
unknown-spender warnings; it never makes a verdict better than "no known risks found".

## Upgradeability

See ADR 0006. For each contract spender, `packages/chain` reads standard proxy slots and works
out who can change its code (single key, multisig, timelock or unknown). Only single-key
control raises a finding.

## Revoking

See ADR 0007. `revokeTransaction` in `packages/core` builds an unsigned transaction per
approval; the user's own wallet signs and sends it. PlainTx never signs anything.

## Scam lists

See ADR 0008. Spenders are checked through a `Blocklist` interface. Today it reads bundled
MIT-licensed lists; live services plug in as further implementations. "Could not check" is
reported, never treated as clean.
