import type { VerdictLevel } from "@plaintx/core";
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

/** What the permission allows, in plain words. */
export function describePermission(row: ScanRow): string {
  switch (row.kind) {
    case "nft-all":
      return "Can move every NFT you hold in this collection";
    case "erc20":
      return row.amount === "unlimited"
        ? "Can spend all of this token"
        : "Can spend a limited amount of this token";
    case "permit2":
      return `${row.amount === "unlimited" ? "Can spend all of this token" : "Can spend a limited amount of this token"} through Permit2`;
  }
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
