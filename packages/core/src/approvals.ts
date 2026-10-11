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
 * Lifecycle of a known app contract, from the curated registry (see ADR 0005).
 * "deprecated": the protocol has said it is retired. "compromised": it was exploited or taken over.
 */
export type SpenderStatus = "active" | "deprecated" | "compromised";

/**
 * Who can replace an upgradeable contract's code (see ADR 0006).
 * "single-key": a personal wallet, or a multisig that needs only one signature.
 * "unknown": a contract we could not identify; it raises no finding.
 */
export type UpgradeController =
  | { kind: "single-key"; address: Address }
  | { kind: "multisig"; address: Address; threshold: number; owners: number }
  | { kind: "timelock"; address: Address; delaySeconds: number }
  | { kind: "unknown"; address?: Address };

/**
 * Whether the spender is a proxy whose code can be swapped. `proxy: "none"` means no standard
 * proxy pattern was found, not that the code can never change.
 */
export type Upgradeability =
  | { proxy: "none" }
  | {
      proxy: "eip1967" | "eip1967-beacon" | "eip1822" | "openzeppelin-legacy";
      /** Absent if it could not be read (e.g. a beacon without `implementation()`). */
      implementation?: Address;
      controller: UpgradeController;
    };

/**
 * Facts about the spender. Supplied by the caller (chain reads, explorers, curated lists)
 * so that the checks here stay deterministic and never touch the network.
 */
export interface SpenderInfo {
  reputation: "malicious" | "known" | "unknown";
  /** False for a plain wallet (EOA): it has no code. */
  isContract: boolean;
  /** Contract source is verified on a block explorer; "unknown" if the lookup was not possible. */
  verified: boolean | "unknown";
  /** Display name, e.g. "Uniswap V2 Router 02". Only set for known spenders. */
  name?: string;
  /** Only set for known spenders. */
  status?: SpenderStatus;
  /** Only set for contracts; absent if it was not checked. */
  upgradeability?: Upgradeability;
  /** Scam lists that name this address, when reputation is "malicious". */
  listedBy?: string[];
  /** True if a scam list could not be checked (e.g. a live service was down). See ADR 0008. */
  blocklistUnavailable?: boolean;
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

  if (spender.blocklistUnavailable && spender.reputation !== "malicious") {
    findings.push({
      id: "blocklist-unavailable",
      level: "caution",
      summary:
        "We couldn't check this address against scam lists right now. Try again before trusting it.",
    });
  }

  if (spender.status === "compromised") {
    findings.push({
      id: "compromised-spender",
      level: "danger",
      summary:
        "This app's contract was hacked or taken over. Anyone holding this permission may be able to take your assets.",
    });
  }

  if (!spender.isContract) {
    findings.push({
      id: "spender-is-wallet",
      level: "danger",
      summary:
        "The permission was given to a personal wallet, not an app. Scammers use this to take assets directly.",
    });
  } else if (spender.verified === false) {
    findings.push({
      id: "unverified-spender",
      level: "caution",
      summary: "The app's contract code is not published, so nobody can check what it does.",
    });
  }

  if (
    spender.upgradeability &&
    spender.upgradeability.proxy !== "none" &&
    spender.upgradeability.controller.kind === "single-key"
  ) {
    findings.push({
      id: "upgradeable-single-key",
      level: "caution",
      summary:
        "One person's key can replace this app's code at any moment, with no delay. If that key is stolen or misused, the app can be turned against you.",
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
