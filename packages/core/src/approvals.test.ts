import { describe, expect, it } from "vitest";
import {
  type Approval,
  assessApproval,
  LONG_EXPIRY_SECONDS,
  rankApprovals,
  type SpenderInfo,
} from "./approvals.js";

const NOW = 1_800_000_000;
const DAY = 24 * 60 * 60;
const MAX_UINT256 = 2n ** 256n - 1n;
const MAX_UINT160 = 2n ** 160n - 1n;

const TOKEN = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";

const known: SpenderInfo = { reputation: "known", isContract: true, verified: true };
const unknown: SpenderInfo = { reputation: "unknown", isContract: true, verified: true };

const erc20 = (amount: bigint): Approval => ({
  kind: "erc20",
  chainId: 1,
  token: TOKEN,
  spender: SPENDER,
  amount,
});
const nftAll: Approval = { kind: "nft-all", chainId: 1, collection: TOKEN, spender: SPENDER };
const permit2 = (amount: bigint, expiration: number): Approval => ({
  kind: "permit2",
  chainId: 1,
  token: TOKEN,
  spender: SPENDER,
  amount,
  expiration,
});

const ids = (approval: Approval, spender: SpenderInfo) =>
  assessApproval(approval, spender, NOW).findings.map((f) => f.id);

describe("assessApproval", () => {
  it("finds no known risks for an unlimited approval to a known, verified app", () => {
    const verdict = assessApproval(erc20(MAX_UINT256), known, NOW);
    expect(verdict).toEqual({ level: "no_known_risks", findings: [] });
  });

  it("flags a known-malicious spender as danger", () => {
    const verdict = assessApproval(erc20(100n), { ...known, reputation: "malicious" }, NOW);
    expect(verdict.level).toBe("danger");
    expect(verdict.findings.map((f) => f.id)).toContain("malicious-spender");
  });

  it("flags approvals to a personal wallet as danger, without a redundant unverified finding", () => {
    const wallet: SpenderInfo = { reputation: "unknown", isContract: false, verified: false };
    expect(assessApproval(erc20(100n), wallet, NOW).level).toBe("danger");
    expect(ids(erc20(100n), wallet)).toEqual(["spender-is-wallet"]);
  });

  it("flags a compromised known app as danger, even for a small or NFT approval", () => {
    const compromised: SpenderInfo = { ...known, status: "compromised" };
    expect(assessApproval(erc20(100n), compromised, NOW).level).toBe("danger");
    expect(ids(nftAll, compromised)).toEqual(["compromised-spender"]);
  });

  it("does not flag a deprecated known app", () => {
    expect(ids(erc20(MAX_UINT256), { ...known, status: "deprecated" })).toEqual([]);
  });

  it("flags an unverified contract as caution", () => {
    expect(ids(erc20(100n), { ...known, verified: false })).toEqual(["unverified-spender"]);
  });

  it("does not flag a contract whose verification status is unknown", () => {
    expect(ids(erc20(100n), { ...known, verified: "unknown" })).toEqual([]);
  });

  it("flags unlimited ERC-20 and Permit2 amounts only for unknown spenders", () => {
    expect(ids(erc20(MAX_UINT256), unknown)).toEqual(["unlimited-unknown-spender"]);
    expect(ids(permit2(MAX_UINT160, NOW + DAY), unknown)).toEqual(["unlimited-unknown-spender"]);
    expect(ids(erc20(1_000_000n), unknown)).toEqual([]);
  });

  it("flags all-NFT approvals to unknown operators", () => {
    expect(ids(nftAll, unknown)).toEqual(["nft-all-unknown-spender"]);
    expect(ids(nftAll, known)).toEqual([]);
  });

  it("flags Permit2 approvals lasting more than a year", () => {
    expect(ids(permit2(100n, NOW + LONG_EXPIRY_SECONDS + 1), known)).toEqual([
      "permit2-long-expiry",
    ]);
    expect(ids(permit2(100n, NOW + 30 * DAY), known)).toEqual([]);
  });

  it("ignores approvals that can no longer move anything", () => {
    const malicious: SpenderInfo = { ...unknown, reputation: "malicious" };
    expect(assessApproval(erc20(0n), malicious, NOW).level).toBe("no_known_risks");
    expect(assessApproval(permit2(MAX_UINT160, NOW), malicious, NOW).level).toBe("no_known_risks");
  });

  it("never mentions 'safe' in a summary", () => {
    const wallet: SpenderInfo = { reputation: "malicious", isContract: false, verified: false };
    const all = [erc20(MAX_UINT256), nftAll, permit2(MAX_UINT160, NOW + 2 * LONG_EXPIRY_SECONDS)]
      .flatMap((a) => [
        ...assessApproval(a, wallet, NOW).findings,
        ...assessApproval(a, { ...unknown, verified: false }, NOW).findings,
      ])
      .map((f) => f.summary);
    expect(all.length).toBeGreaterThan(0);
    for (const summary of all) expect(summary).not.toMatch(/\bsafe\b/i);
  });
});

describe("rankApprovals", () => {
  it("orders danger first, then caution, then the rest", () => {
    const ranked = rankApprovals(
      [
        { approval: erc20(100n), spender: known },
        { approval: nftAll, spender: unknown },
        { approval: erc20(100n), spender: { ...known, reputation: "malicious" } },
      ],
      NOW,
    );
    expect(ranked.map((r) => r.verdict.level)).toEqual(["danger", "caution", "no_known_risks"]);
  });

  it("puts approvals with more findings first within the same level", () => {
    const ranked = rankApprovals(
      [
        { approval: erc20(MAX_UINT256), spender: unknown },
        { approval: erc20(MAX_UINT256), spender: { ...unknown, verified: false } },
      ],
      NOW,
    );
    expect(ranked.map((r) => r.verdict.findings.length)).toEqual([2, 1]);
  });
});
