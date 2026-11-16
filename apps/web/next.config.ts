import { existsSync } from "node:fs";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

// API keys live in the repository's root .env, shared with the CLIs. They are only read on the
// server (app/api/scan) and never sent to the browser.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/** Sent with every response. The Content-Security-Policy is set per page in proxy.ts. */
const securityHeaders = [
  // .app domains are HTTPS-only in browsers anyway; this covers other hosts we may add.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Wallets that open a popup still need to reach this window.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()",
  },
];

const config: NextConfig = {
  // Type checking runs in `pnpm typecheck` (CI), with the repository's TypeScript version.
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const { SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN } = process.env;

// Error reporting (ADR 0014). With a SENTRY_AUTH_TOKEN, the build uploads source maps to Sentry
// and then deletes them, so stack traces are readable without publishing our source maps.
export default withSentryConfig(config, {
  ...(SENTRY_ORG ? { org: SENTRY_ORG } : {}),
  ...(SENTRY_PROJECT ? { project: SENTRY_PROJECT } : {}),
  ...(SENTRY_AUTH_TOKEN ? { authToken: SENTRY_AUTH_TOKEN } : {}),
  // Browser events reach Sentry through our own origin: no CSP change, and ad blockers allow it.
  // proxy.ts skips this path.
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  silent: !process.env.CI,
  telemetry: false,
});
