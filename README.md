# PlainTx

Plain-English safety checks for crypto wallets. Paste a transaction, signature request, address or
link and get a clear verdict plus what to do next.

> Status: early development. Nothing here is ready for real funds yet.

## Principles

- **Deterministic checks decide the verdict.** An LLM may only *explain* a verdict, never make it.
- **We never say "safe".** The best verdict is "no known risks found".
- **Non-custodial.** PlainTx never asks for or holds keys or seed phrases.
- **Public good.** MIT licensed, free for individuals, no token.

## Roadmap

1. Wallet health check: token approvals ranked by risk, one-click revoke.
2. Transaction and signature explainer: fork simulation, Permit/Permit2 decoding.
3. Address and link checks, open API.
4. Browser extension.

Chains first: Ethereum, Base, Arbitrum.

## Development

Requires Node 24+ and pnpm (`corepack enable`). Develop on Linux, macOS or WSL2.

```sh
pnpm install
pnpm run ci     # lint, build, typecheck, test
pnpm format     # auto-fix formatting
```

The web app caches scans in Postgres (ADR 0010) and keeps rate limits in Redis (ADR 0012).
Locally, start both with Docker:

```sh
cp .env.example .env                    # then fill in the API keys
docker compose up -d                    # Postgres :5432, Redis :6379
pnpm --filter @plaintx/cache migrate    # create or update the tables
pnpm -C apps/web dev                    # http://localhost:3000
```

Deploying: see [docs/DEPLOY.md](docs/DEPLOY.md).

Layout:

```
apps/web/           wallet health check (Next.js)
packages/core/      deterministic risk checks and verdicts
packages/chain/     reads approvals and spender facts from chain data
packages/registry/  known apps and scam lists
packages/cache/     Postgres scan cache
packages/limits/    rate limits shared through Redis
docs/               architecture, decisions (ADRs), runbooks
```

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
