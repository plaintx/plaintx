/**
 * Manages the risk-address database (ADR 0017) at DATABASE_URL. Run `migrate` first.
 *
 *   pnpm --filter @plaintx/cache risk stats
 *   pnpm --filter @plaintx/cache risk import-bundled
 *   pnpm --filter @plaintx/cache risk source <id> <name> <url> <license>
 *   pnpm --filter @plaintx/cache risk add <chainId> <address> <sourceId> <category> [note] [--evidence <url>]
 *   pnpm --filter @plaintx/cache risk retract <chainId> <address> --reason <text> [--source <id>]
 *   pnpm --filter @plaintx/cache risk check <chainId> <address>
 */
import { parseArgs } from "node:util";
import type { Address } from "@plaintx/core";
import postgres from "postgres";
import {
  addEntries,
  importBundledLists,
  postgresBlocklist,
  RISK_CATEGORIES,
  type RiskCategory,
  retractEntry,
  riskStats,
  upsertSource,
} from "./risk-db.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    evidence: { type: "string" },
    reason: { type: "string" },
    source: { type: "string" },
  },
});
const [command, ...args] = positionals;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set: add it to .env locally, or pass it in the environment.");
  process.exit(1);
}

function chainId(text: string | undefined): number {
  const id = Number(text);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Not a chain id: ${text}`);
  return id;
}

function address(text: string | undefined): Address {
  if (!text || !/^0x[0-9a-fA-F]{40}$/.test(text)) throw new Error(`Not an address: ${text}`);
  return text as Address;
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  switch (command) {
    case "stats": {
      const stats = await riskStats(sql);
      if (stats.length === 0) console.log("The risk database is empty.");
      for (const s of stats) {
        console.log(
          `${s.sourceId}  chain ${s.chainId}: ${s.active} active, ${s.retracted} retracted`,
        );
      }
      break;
    }
    case "import-bundled":
      console.log(`Added ${await importBundledLists(sql)} new entries from the bundled lists.`);
      break;
    case "source": {
      const [id, name, sourceUrl, license] = args;
      if (!id || !name || !sourceUrl || !license)
        throw new Error("Usage: source <id> <name> <url> <license>");
      await upsertSource(sql, { id, name, url: sourceUrl, license });
      console.log(`Saved source ${id}.`);
      break;
    }
    case "add": {
      const [chain, addr, sourceId, category, note] = args;
      if (!sourceId || !RISK_CATEGORIES.includes(category as RiskCategory)) {
        throw new Error(
          `Usage: add <chainId> <address> <sourceId> <${RISK_CATEGORIES.join("|")}> [note]`,
        );
      }
      const added = await addEntries(sql, [
        {
          chainId: chainId(chain),
          address: address(addr),
          sourceId,
          category: category as RiskCategory,
          ...(note ? { note } : {}),
          ...(values.evidence ? { evidence: values.evidence } : {}),
        },
      ]);
      console.log(added ? "Added." : "Updated the existing entry.");
      break;
    }
    case "retract": {
      const [chain, addr] = args;
      if (!values.reason)
        throw new Error("Usage: retract <chainId> <address> --reason <text> [--source <id>]");
      const count = await retractEntry(sql, {
        chainId: chainId(chain),
        address: address(addr),
        reason: values.reason,
        ...(values.source ? { sourceId: values.source } : {}),
      });
      console.log(
        count
          ? `Retracted ${count} entr${count === 1 ? "y" : "ies"}.`
          : "Nothing active to retract.",
      );
      break;
    }
    case "check": {
      const [chain, addr] = args;
      const result = await postgresBlocklist(sql).check(chainId(chain), address(addr));
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    default:
      console.error(
        "Commands: stats, import-bundled, source, add, retract, check. See risk-cli.ts.",
      );
      process.exitCode = 1;
  }
} catch (error) {
  // Connection errors can include the URL, which holds the password.
  console.error(
    String(error instanceof Error ? error.message : error).replaceAll(url, "<DATABASE_URL>"),
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
