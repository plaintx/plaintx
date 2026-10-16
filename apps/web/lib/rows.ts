import { type AssetInfo, assetOf, describeUpgradeability } from "@plaintx/chain";
import { type RankedApproval, revokeTransaction, UNLIMITED_THRESHOLD } from "@plaintx/core";
import type { ScanRow } from "./types";

/** Turns a ranked approval into a JSON-safe row, with its revoke transaction ready. */
export function toRow(
  { approval, spender, verdict }: RankedApproval,
  assets: ReadonlyMap<string, AssetInfo> = new Map(),
): ScanRow {
  const asset = assetOf(approval);
  const assetInfo = assets.get(asset);
  const upgrades = describeUpgradeability(spender.upgradeability);
  const amount =
    approval.kind === "nft-all"
      ? "all"
      : approval.amount >= UNLIMITED_THRESHOLD
        ? "unlimited"
        : "limited";
  return {
    id: `${approval.kind}:${asset}:${approval.spender}`.toLowerCase(),
    kind: approval.kind,
    asset,
    ...(assetInfo ? { assetInfo } : {}),
    spender: approval.spender,
    ...(spender.name ? { spenderName: spender.name } : {}),
    ...(spender.status ? { spenderStatus: spender.status } : {}),
    spenderIsContract: spender.isContract,
    amount,
    ...(amount === "limited" && approval.kind !== "nft-all"
      ? { rawAmount: approval.amount.toString() }
      : {}),
    ...(approval.kind === "permit2" ? { expiration: approval.expiration } : {}),
    verdict,
    ...(upgrades ? { upgrades } : {}),
    ...(spender.listedBy ? { listedBy: spender.listedBy } : {}),
    revoke: revokeTransaction(approval),
  };
}
