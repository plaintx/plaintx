import type { AssetInfo, ScanProgress } from "@plaintx/chain";
import type { Address, RevokeTransaction, SpenderStatus, Verdict } from "@plaintx/core";

/** One approval as the browser sees it: JSON-safe (no bigint) and ready to display. */
export interface ScanRow {
  id: string;
  kind: "erc20" | "nft-all" | "permit2";
  /** Token or NFT collection. */
  asset: Address;
  /** What the asset calls itself. Contract-supplied, so display only. */
  assetInfo?: AssetInfo;
  spender: Address;
  spenderName?: string;
  spenderStatus?: SpenderStatus;
  spenderIsContract: boolean;
  /** "all" for NFT collection approvals. */
  amount: "unlimited" | "limited" | "all";
  /** Limited approvals only: the raw amount as a decimal string (JSON has no bigint). */
  rawAmount?: string;
  /** Permit2 only: unix seconds. */
  expiration?: number;
  verdict: Verdict;
  upgrades?: string;
  listedBy?: string[];
  /** Unsigned transaction for the owner's wallet. */
  revoke: RevokeTransaction;
}

export interface ScanResult {
  owner: Address;
  chainId: number;
  chainName: string;
  /** ISO timestamp. */
  scannedAt: string;
  rows: ScanRow[];
}

export type { ScanProgress };

/**
 * One line of the /api/scan response, which is newline-delimited JSON: progress lines while the
 * scan runs, then exactly one result or error line.
 */
export type ScanEvent =
  | { type: "progress"; progress: ScanProgress }
  | { type: "result"; result: ScanResult }
  | { type: "error"; error: string };

export const CHAIN_OPTIONS = [
  { name: "ethereum", label: "Ethereum", chainId: 1, explorer: "https://etherscan.io" },
  { name: "base", label: "Base", chainId: 8453, explorer: "https://basescan.org" },
  { name: "arbitrum", label: "Arbitrum", chainId: 42161, explorer: "https://arbiscan.io" },
] as const;

export type ChainOption = (typeof CHAIN_OPTIONS)[number];
export type SupportedChainId = ChainOption["chainId"];
