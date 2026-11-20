import "server-only";
import postgres, { type Sql } from "postgres";

// One pool per server process. Next.js dev reloads modules, so keep it on globalThis.
const globals = globalThis as { plaintxSql?: Sql | null };

/**
 * The Postgres pool shared by the scan cache (ADR 0010) and the risk database (ADR 0017), or
 * null when DATABASE_URL is not set.
 */
export function database(): Sql | null {
  if (globals.plaintxSql === undefined) {
    const url = process.env.DATABASE_URL;
    globals.plaintxSql = url
      ? postgres(url, { max: 10, connect_timeout: 5, onnotice: () => {} })
      : null;
  }
  return globals.plaintxSql;
}
