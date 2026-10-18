import type { VerdictLevel } from "@plaintx/core";
import { formatUnits } from "viem";
import { CHAIN_OPTIONS, type ScanProgress, type ScanRow } from "./types";

/** Never "safe": the best we can say is that no known risks were found (ADR 0002). */
export const VERDICT_LABELS: Record<VerdictLevel, string> = {
  danger: "Danger",
  caution: "Caution",
  no_known_risks: "No known risks found",
};

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  const chain = CHAIN_OPTIONS.find((c) => c.chainId === chainId);
  return chain ? `${chain.explorer}/address/${address}` : null;
}

export function explorerTxUrl(chainId: number, hash: string): string | null {
  const chain = CHAIN_OPTIONS.find((c) => c.chainId === chainId);
  return chain ? `${chain.explorer}/tx/${hash}` : null;
}

/**
 * What the permission allows, in plain words, split around the asset so the asset can be shown
 * as a link: `{spender} {action} {asset} {suffix}`, e.g. "can spend up to 1,500" + "USDC".
 * `asset` is the asset's own symbol or name, or undefined to show its address.
 */
export function describePermission(row: ScanRow): {
  action: string;
  asset?: string;
  suffix?: string;
} {
  const { symbol, name, decimals } = row.assetInfo ?? {};
  if (row.kind === "nft-all") {
    const label = name ?? symbol;
    return label
      ? { action: "can move every NFT you hold in", asset: label }
      : { action: "can move every NFT you hold in this collection" };
  }

  const label = symbol ?? name;
  const suffix = row.kind === "permit2" ? { suffix: "through Permit2" } : {};
  if (row.amount === "limited" && row.rawAmount !== undefined && decimals !== undefined) {
    const amount = formatTokenAmount(row.rawAmount, decimals);
    return label
      ? { action: `can spend up to ${amount}`, asset: label, ...suffix }
      : { action: `can spend up to ${amount} of this token`, ...suffix };
  }
  const how = row.amount === "limited" ? "a limited amount" : "all";
  return label
    ? { action: `can spend ${how} of your`, asset: label, ...suffix }
    : { action: `can spend ${how} of this token`, ...suffix };
}

/** Decimal places shown; smaller amounts show as "< 0.0001". */
const FRACTION_DIGITS = 4;

/** A raw token amount in human units: "1,500", "0.25", "< 0.0001". */
export function formatTokenAmount(raw: string, decimals: number): string {
  const units = formatUnits(BigInt(raw), decimals);
  const [whole = "0", fraction = ""] = units.split(".");
  const shown = fraction.slice(0, FRACTION_DIGITS).replace(/0+$/, "");
  const wholeText = BigInt(whole).toLocaleString("en-US");
  if (whole === "0" && !shown && fraction) return `< 0.${"0".repeat(FRACTION_DIGITS - 1)}1`;
  return shown ? `${wholeText}.${shown}` : wholeText;
}

/** Counts per verdict level, for the summary. */
export function countByLevel(rows: readonly ScanRow[]): Record<VerdictLevel, number> {
  const counts: Record<VerdictLevel, number> = { danger: 0, caution: 0, no_known_risks: 0 };
  for (const row of rows) counts[row.verdict.level]++;
  return counts;
}

export const SCAN_STEPS = 3;

/** A scan step in plain words: which step it is, what it is doing and how far it has got. */
export function describeProgress(progress: ScanProgress): {
  step: number;
  label: string;
  detail: string;
  /** 0 to 1, or undefined while the total is not known. */
  fraction?: number;
} {
  const n = (x: number) => x.toLocaleString("en-US");
  switch (progress.step) {
    case "history":
      return {
        step: 1,
        label: "Reading this wallet's approval history",
        detail: `${n(progress.events)} approval event${progress.events === 1 ? "" : "s"} found`,
      };
    case "allowances":
      return {
        step: 2,
        label: "Checking which approvals are still active",
        detail: `${n(progress.done)} of ${n(progress.total)}`,
        fraction: progress.total ? progress.done / progress.total : 1,
      };
    case "spenders":
      return {
        step: 3,
        label: "Checking the apps and addresses you approved",
        detail: `${n(progress.done)} of ${n(progress.total)}`,
        fraction: progress.total ? progress.done / progress.total : 1,
      };
  }
}

/** A wait in words, rounded up: "45 seconds", "1 minute", "3 minutes". */
export function waitTime(seconds: number): string {
  if (seconds < 60) return seconds === 1 ? "1 second" : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
