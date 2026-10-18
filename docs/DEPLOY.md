# Deploying PlainTx

How plaintx.app is set up. Why it is set up this way: ADR 0013.

## Services

| Service | Plan | Holds |
| --- | --- | --- |
| Vercel | Hobby (Pro once commercial) | `apps/web`, region `fra1` |
| Neon (via Vercel Marketplace) | Free | Postgres scan cache, AWS `eu-central-1` |
| Upstash Redis (via Vercel Marketplace) | Free | Rate limits, `eu-central-1` |
| Etherscan | Free | Approval history, verification. Ethereum and Arbitrum only. |
| Alchemy | Free | RPC for Ethereum and Arbitrum |
| Cloudflare | Free | DNS for plaintx.app (DNS only, no proxy) |

Accounts belong to admin@plaintx.app, with 2FA, and their recovery codes kept in the password
manager. Production keys are separate from development keys.

## First-time setup

1. **Vercel project:** import `plaintx/plaintx` from GitHub. Root directory: `apps/web`.
   Framework: Next.js. Leave the build and install commands as detected:
   `apps/web/vercel.json` sets the build command.
2. **Storage:** in the project's Storage tab, add Neon Postgres and Upstash Redis, both in
   Frankfurt / `eu-central-1`, connected to all environments. For Neon, enable a separate
   database branch for Preview deployments, so previews never migrate production.
3. **Environment variables** (Settings → Environment Variables):

   | Name | Value | Environments |
   | --- | --- | --- |
   | `DATABASE_URL` | Set by Neon (pooled connection string) | All |
   | `REDIS_URL` | Upstash's `rediss://` URL (not the REST URL). Add it if the integration names it differently. | All |
   | `ETHERSCAN_API_KEY` | Production key | Production, Preview |
   | `ETHERSCAN_CALLS_PER_SECOND` | `5` | All |
   | `ETH_RPC_URL` | Alchemy Ethereum URL | Production, Preview |
   | `ARBITRUM_RPC_URL` | Alchemy Arbitrum URL | Production, Preview |
   | `TRUSTED_PROXY_COUNT` | `1` | All |
   | `ENABLE_EXPERIMENTAL_COREPACK` | `1` | All |

   Leave `BASE_RPC_URL` unset while Base is off. Mark keys and URLs as Sensitive.
4. **Deploy** from `main`. The build log should show the packages building, then
   "Applied N migration(s)." or "Schema is up to date.", then the Next.js build.
5. **Domain:** in Vercel, add `plaintx.app` (and `www.plaintx.app` redirecting to it). In
   Cloudflare, create the records Vercel shows, with the proxy status set to **DNS only**
   (grey cloud). Vercel issues the TLS certificate.

## Check after each production deploy

- `https://plaintx.app` loads, and a scan of a known wallet completes on Ethereum.
- Response headers include `content-security-policy` with a nonce and
  `strict-transport-security`. The browser console shows no CSP errors.
- Base appears as "Base (coming soon)" and cannot be picked.
- The 11th scan in a row from one IP gets "try again in 1 minute".
- Function logs show no "REDIS_URL is not set" or "TRUSTED_PROXY_COUNT is 0" warnings.

## Turning on Base

Get an Etherscan plan that covers Base, set `BASE_RPC_URL`, raise
`ETHERSCAN_CALLS_PER_SECOND` to the plan's limit, and set `scannable: true` for Base in
`apps/web/lib/types.ts`.
