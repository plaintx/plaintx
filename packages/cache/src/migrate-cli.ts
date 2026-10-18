/**
 * Applies pending schema migrations to DATABASE_URL.
 * Usage: pnpm --filter @plaintx/cache migrate   (reads the root .env if present)
 */
import postgres from "postgres";
import { migrate } from "./migrations.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set: add it to .env locally, or to the host's environment variables.",
  );
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const applied = await migrate(sql);
  console.log(applied ? `Applied ${applied} migration(s).` : "Schema is up to date.");
} catch (error) {
  // Connection errors can include the URL, which holds the password.
  console.error(`Migration failed: ${String(error).replaceAll(url, "<DATABASE_URL>")}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
