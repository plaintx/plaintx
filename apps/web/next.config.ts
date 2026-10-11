import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// API keys live in the repository's root .env, shared with the CLIs. They are only read on the
// server (app/api/scan) and never sent to the browser.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  // Type checking runs in `pnpm typecheck` (CI), with the repository's TypeScript version.
  typescript: { ignoreBuildErrors: true },
};

export default config;
