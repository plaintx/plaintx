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

| Component        | Status  | Purpose                                                  |
| ---------------- | ------- | -------------------------------------------------------- |
| `packages/core`  | started | Verdict model and deterministic risk checks              |
| `apps/web`       | planned | Next.js app: wallet health check, paste-and-check UI     |
| `apps/extension` | planned | Browser extension that checks requests before signing    |
| Simulation       | planned | Foundry Anvil forks to preview a transaction's effects   |
| Storage          | planned | Postgres for known-bad lists and cached results          |

## Chains

Ethereum, Base and Arbitrum first, via viem.
