# CLAUDE.md

PlainTx: plain-English safety checks for crypto wallets. See README.md for the product and
principles.

## Non-negotiables

- Verdicts come from deterministic checks in `packages/core`. LLMs only explain, never decide.
- Never output or render the word "safe" as a verdict. Use `no_known_risks` / "no known risks found".
- Never request, log or store private keys or seed phrases.

## Commands

- `pnpm run ci`: lint (Biome), typecheck, test (Vitest), build. Must pass before committing.
- `pnpm format`: auto-fix formatting.

## Conventions

- TypeScript strict, ESM, Node 24+. pnpm workspaces: `apps/*`, `packages/*`.
- Tests live next to code as `*.test.ts`.
- Architecture decisions go in `docs/decisions/` as numbered ADRs.
- Work on branches and merge to `main` via pull request.
