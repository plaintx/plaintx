import { describe, expect, it } from "vitest";
import {
  countByLevel,
  describePermission,
  describeProgress,
  explorerAddressUrl,
  shortAddress,
  VERDICT_LABELS,
} from "./format";
import type { ScanRow } from "./types";

const row = (over: Partial<ScanRow>): ScanRow =>
  ({
    kind: "erc20",
    amount: "unlimited",
    verdict: { level: "caution", findings: [] },
    ...over,
  }) as ScanRow;

describe("format", () => {
  it("never labels a verdict as safe", () => {
    for (const label of Object.values(VERDICT_LABELS))
      expect(label.toLowerCase()).not.toContain("safe");
    expect(VERDICT_LABELS.no_known_risks).toBe("No known risks found");
  });

  it("shortens addresses and links to the right explorer", () => {
    const address = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    expect(shortAddress(address)).toBe("0x7a25…488D");
    expect(explorerAddressUrl(8453, address)).toBe(`https://basescan.org/address/${address}`);
    expect(explorerAddressUrl(999, address)).toBeNull();
  });

  it("describes permissions in plain words", () => {
    expect(describePermission(row({ kind: "nft-all", amount: "all" }))).toBe(
      "Can move every NFT you hold in this collection",
    );
    expect(describePermission(row({ amount: "limited" }))).toBe(
      "Can spend a limited amount of this token",
    );
    expect(describePermission(row({ kind: "permit2" }))).toBe(
      "Can spend all of this token through Permit2",
    );
  });

  it("counts rows per verdict", () => {
    const rows = [row({}), row({}), row({ verdict: { level: "danger", findings: [] } })];
    expect(countByLevel(rows)).toEqual({ danger: 1, caution: 2, no_known_risks: 0 });
  });
});

describe("describeProgress", () => {
  it("counts events while the history total is unknown", () => {
    expect(describeProgress({ step: "history", events: 1234 })).toEqual({
      step: 1,
      label: "Reading this wallet's approval history",
      detail: "1,234 approval events found",
    });
  });

  it("reports later steps as done out of total", () => {
    const p = describeProgress({ step: "allowances", done: 500, total: 2000 });
    expect([p.step, p.detail, p.fraction]).toEqual([2, "500 of 2,000", 0.25]);
  });

  it("treats an empty step as complete", () => {
    expect(describeProgress({ step: "spenders", done: 0, total: 0 }).fraction).toBe(1);
  });
});
