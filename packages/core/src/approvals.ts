import { type Finding, type Verdict, verdictFrom } from "./verdict.js";

export type Address = `0x${string}`;

/**
 * A standing permission that lets someone else move a wallet's assets.
 * `spender` is the address that holds the permission (for NFTs, the "operator").
 */
export type Approval =
  | {
      /** ERC-20 `approve(spender, amount)`. */
      kind: "erc20";
      chainId: number;
      token: Address;
      spender: Address;
      amount: bigint;
    }
  | {
      /** ERC-721 / ERC-1155 `setApprovalForAll(operator, true)`: every NFT in the collection. */
      kind: "nft-all";
      chainId: number;
      collection: Address;
      spender: Address;
    }
  | {
      /** Uniswap Permit2 allowance. `expiration` is a unix timestamp in seconds. */
      kind: "permit2";
      chainId: number;
      token: Address;
      spender: Address;
      amount: bigint;
      expiration: number;
    };

/**
 * Facts about the spender. Supplied by the caller (chain reads, explorers, curated lists)
 * so that the checks here stay deterministic and never touch the network.
 */
export interface SpenderInfo {
  reputation: "malicious" | "known" | "unknown";
  /** False for a plain wallet (EOA): it has no code. */
  isContract: boolean;
  /** Contract source is verified on a block explorer. */
  verified: boolean;
  name?: string;
}

/**
 * Amounts at or above this are treated as unlimited. Apps usually approve the type maximum
 * (2^256-1 for ERC-20, 2^160-1 for Permit2); 2^128 catches those and other "effectively
 * infinite" values while staying far above any real token balance.
 */
export const UNLIMITED_THRESHOLD = 2n ** 128n;

/** Permit2 approvals lasting longer than this from now get flagged. */
export const LONG_EXPIRY_SECONDS = 365 * 24 * 60 * 60;

/**
 * Runs every approval rule. `now` is a unix timestamp in seconds, passed in so results are
 * reproducible. See docs/decisions/0003-approval-risk-rules.md.
 */
export function assessApproval(approval: Approval, spender: SpenderInfo, now: number): Verdict {
  if (isInactive(approval, now)) {
    return verdictFrom([]);
  }

  const findings: Finding[] = [];

  if (spender.reputation === "malicious") {
    findings.push({
      id: "malicious-spender",
      level: "danger",
      summary: "This address is on a list of known scam or drainer addresses.",
    });
  }

  if (!spender.isContract) {
    findings.push({
      id: "spender-is-wallet",
      level: "danger",
      summary:
        "The permission was given to a personal wallet, not an app. Scammers use this to take assets directly.",
    });
  } else if (!spender.verified) {
    findings.push({
      id: "unverified-spender",
      level: "caution",
      summary: "The app's contract code is not published, so nobody can check what it does.",
    });
  }

  if (spender.reputation === "unknown") {
    if (approval.kind !== "nft-all" && approval.amount >= UNLIMITED_THRESHOLD) {
      findings.push({
        id: "unlimited-unknown-spender",
        level: "caution",
        summary: "An unknown address can spend all of this token, now and in the future.",
      });
    }
    if (approval.kind === "nft-all") {
      findings.push({
        id: "nft-all-unknown-spender",
        level: "caution",
        summary: "An unknown address can move every NFT you hold in this collection.",
      });
    }
  }

  if (approval.kind === "permit2" && approval.expiration - now > LONG_EXPIRY_SECONDS) {
    findings.push({
      id: "permit2-long-expiry",
      level: "caution",
      summary: "This permission does not expire for more than a year.",
    });
  }

  return verdictFrom(findings);
}

export interface RankedApproval {
  approval: Approval;
  spender: SpenderInfo;
  verdict: Verdict;
}

const severity = { danger: 2, caution: 1, no_known_risks: 0 } as const;

/** Assesses each approval and orders them riskiest first, for the revoke list. */
export function rankApprovals(
  items: readonly { approval: Approval; spender: SpenderInfo }[],
  now: number,
): RankedApproval[] {
  return items
    .map(({ approval, spender }) => ({
      approval,
      spender,
      verdict: assessApproval(approval, spender, now),
    }))
    .sort(
      (a, b) =>
        severity[b.verdict.level] - severity[a.verdict.level] ||
        b.verdict.findings.length - a.verdict.findings.length,
    );
}

/** A zero allowance or an expired Permit2 approval can no longer move anything. */
function isInactive(approval: Approval, now: number): boolean {
  if (approval.kind === "nft-all") return false;
  if (approval.amount === 0n) return true;
  return approval.kind === "permit2" && approval.expiration <= now;
}
