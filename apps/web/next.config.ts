import { existsSync } from "node:fs";
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

export default config;
