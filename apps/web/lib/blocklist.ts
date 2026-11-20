import "server-only";
import { postgresBlocklist } from "@plaintx/cache";
import type { Address } from "@plaintx/core";
import { type Blocklist, bundledBlocklist, combineBlocklists } from "@plaintx/registry";
import * as Sentry from "@sentry/nextjs";
import { database } from "./db";

const globals = globalThis as { plaintxBlocklist?: Blocklist };

/**
 * Scam lists for every check: the lists bundled in the code, plus our risk database when
 * DATABASE_URL is set (ADR 0017). If the database fails, matches from the bundled lists still
 * count, and other addresses are "unavailable", never clean.
 */
export function riskBlocklist(): Blocklist {
  if (!globals.plaintxBlocklist) {
    const sql = database();
    globals.plaintxBlocklist = sql
      ? combineBlocklists(bundledBlocklist, reportOutages(postgresBlocklist(sql)))
      : bundledBlocklist;
  }
  return globals.plaintxBlocklist;
}

/** Tells Sentry once when the database stops answering and logs when it is back, like Redis. */
function reportOutages(list: Blocklist): Blocklist {
  let healthy = true;
  const url = process.env.DATABASE_URL ?? "";
  async function watch<T>(run: () => Promise<T>): Promise<T> {
    try {
      const result = await run();
      if (!healthy) {
        healthy = true;
        console.info("Risk database: answering again.");
      }
      return result;
    } catch (error) {
      if (healthy) {
        healthy = false;
        const reason = String(error).replaceAll(url, "<DATABASE_URL>");
        console.warn("Risk database unavailable, scam-list checks are incomplete:", reason);
        Sentry.captureMessage(`Risk database unavailable: ${reason}`, "warning");
      }
      throw error;
    }
  }
  return {
    check: (chainId, address: Address) => watch(() => list.check(chainId, address)),
    ...(list.checkMany
      ? {
          checkMany: (chainId: number, addresses: readonly Address[]) =>
            watch(() =>
              (list.checkMany as NonNullable<Blocklist["checkMany"]>)(chainId, addresses),
            ),
        }
      : {}),
  };
}
