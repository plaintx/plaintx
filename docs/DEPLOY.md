# Deploying PlainTx

How plaintx.app is set up. Why it is set up this way: ADR 0013.

## Services

| Service                                | Plan                        | Holds                                                       |
| -------------------------------------- | --------------------------- | ----------------------------------------------------------- |
| Vercel                                 | Hobby (Pro once commercial) | `apps/web`, region `fra1`                                   |
| Neon (via Vercel Marketplace)          | Free                        | Postgres scan cache, AWS `eu-central-1`                     |
| Upstash Redis (via Vercel Marketplace) | Free                        | Rate limits, `eu-central-1`                                 |
| Etherscan                              | Free                        | Approval history, verification. Ethereum and Arbitrum only. |
| Alchemy                                | Free                        | RPC for Ethereum and Arbitrum                               |
| Cloudflare                             | Free                        | DNS for plaintx.app (DNS only, no proxy)                    |
| Sentry                                 | Free                        | Error reports, EU (Germany) region. See ADR 0014.           |

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

   | Name                           | Value                                                                                             | Environments        |
   | ------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------- |
   | `DATABASE_URL`                 | Set by Neon (pooled connection string)                                                            | All                 |
   | `REDIS_URL`                    | Upstash's `rediss://` URL (not the REST URL). Add it if the integration names it differently.     | All                 |
   | `ETHERSCAN_API_KEY`            | Production key                                                                                    | Production, Preview |
   | `ETHERSCAN_CALLS_PER_SECOND`   | `5`                                                                                               | All                 |
   | `ETH_RPC_URL`                  | Alchemy Ethereum URL                                                                              | Production, Preview |
   | `ARBITRUM_RPC_URL`             | Alchemy Arbitrum URL                                                                              | Production, Preview |
   | `TRUSTED_PROXY_COUNT`          | `1`                                                                                               | All                 |
   | `ENABLE_EXPERIMENTAL_COREPACK` | `1`                                                                                               | All                 |
   | `NEXT_PUBLIC_SENTRY_DSN`       | The Sentry project's DSN (Settings → Client Keys)                                                 | Production, Preview |
   | `SENTRY_ORG`                   | Sentry organization slug                                                                          | Production, Preview |
   | `SENTRY_PROJECT`               | Sentry project slug                                                                               | Production, Preview |
   | `SENTRY_AUTH_TOKEN`            | Organization auth token for source map uploads                                                    | Production, Preview |
   | `CRON_SECRET`                  | Random string of 32+ characters (e.g. `openssl rand -hex 32`): lets Vercel Cron call the clean-up | Production          |

   Leave `BASE_RPC_URL` unset while Base is off. Mark keys and URLs as Sensitive, including
   `SENTRY_AUTH_TOKEN` and `CRON_SECRET`. The DSN is built into the page, so changing it needs a redeploy.
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
- The next day: Vercel → Settings → Cron Jobs shows `/api/cron/prune` succeeded (200, with
  counts in the logs). A 401 means `CRON_SECRET` is missing.
- Function logs show no "REDIS_URL is not set" or "TRUSTED_PROXY_COUNT is 0" warnings.
- Sentry: the build log shows source maps uploaded. Requests to `/monitoring` return 200,
  with no CSP errors. Sentry's Issues list shows no new errors from this release.

## Setting up Sentry

1. In Sentry (account on admin@plaintx.app, 2FA on), create an organization with data storage
   in the **EU (Germany)** region, then a **Next.js** project. The region cannot be changed
   later.
2. In the project's settings, turn on **Prevent Storing of IP Addresses** and leave Data
   Scrubbing on. The app already sends no IPs; this is a second guard.
3. Create an organization auth token (scope: project releases and source maps) and add the
   four `SENTRY_` variables above.
4. Redeploy without the build cache, then check the first event: open the site, run in the
   browser console `setTimeout(() => { throw new Error("Sentry check") })`, and confirm it
   appears in Sentry with a readable stack trace and no IP, user, headers or wallet address.
   Resolve the issue afterwards.

## Turning on Base

Get an Etherscan plan that covers Base, set `BASE_RPC_URL`, raise
`ETHERSCAN_CALLS_PER_SECOND` to the plan's limit, and set `scannable: true` for Base in
`apps/web/lib/types.ts`.
