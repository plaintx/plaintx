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
pnpm run ci     # lint, typecheck, test, build
pnpm format     # auto-fix formatting
```

Layout:

```
apps/            user-facing apps (web, extension; not yet created)
packages/core/   deterministic risk checks and verdicts
docs/            architecture, decisions (ADRs), runbooks
```

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
