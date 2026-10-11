# Contributing

Thanks for helping make wallets safer.

## Before your first pull request

You must agree to the [Contributor License Agreement](CLA.md). A bot will ask you to sign it on
your first pull request. This keeps the project's licensing clear for everyone.

## Workflow

1. Open an issue first for anything non-trivial.
2. Branch from `main`, keep pull requests small and focused.
3. Run `pnpm run ci` before pushing. CI must be green to merge.
4. Never commit secrets. Use `.env` (ignored) and document new variables in `.env.example`.

## Rules for risk checks

- Checks in `packages/core` must be deterministic and covered by tests.
- Every check that can produce `danger` needs a test with a real-world example (tx hash or
  signature payload) where possible.
- User-facing text never says "safe". Use "no known risks found".
