/** Environment variables whose values must never leave the server. */
const SECRET_ENV = [
  "ETH_RPC_URL",
  "BASE_RPC_URL",
  "ARBITRUM_RPC_URL",
  "ETHERSCAN_API_KEY",
  "DATABASE_URL",
  "REDIS_URL",
  "SENTRY_AUTH_TOKEN",
] as const;

/** Shorter path segments are route names such as "v2", not keys. */
const MIN_KEY_LENGTH = 16;

/**
 * The secret strings in `env`: each value, and for URLs also the password and any key-like path
 * segment, since an error may quote a key without the rest of its URL (Alchemy keys are in the
 * path). Longest first, so a whole URL is replaced before the key inside it.
 */
export function secretValues(env: Record<string, string | undefined>): string[] {
  const secrets = new Set<string>();
  for (const name of SECRET_ENV) {
    const value = env[name]?.trim();
    if (!value) continue;
    secrets.add(value);
    if (!URL.canParse(value)) continue;
    const url = new URL(value);
    for (const part of [url.password, ...url.pathname.split("/")]) {
      if (part.length >= MIN_KEY_LENGTH) secrets.add(decodeURIComponent(part));
    }
  }
  return [...secrets].sort((a, b) => b.length - a.length);
}

/** A copy of a JSON-like `value` with every occurrence of each secret replaced. */
export function redactSecrets<T>(value: T, secrets: readonly string[]): T {
  if (secrets.length === 0) return value;
  let json = JSON.stringify(value);
  for (const secret of secrets) {
    // Match the secret as it appears inside a JSON string.
    json = json.replaceAll(JSON.stringify(secret).slice(1, -1), "<redacted>");
  }
  return JSON.parse(json) as T;
}
