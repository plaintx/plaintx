import { describeUpgradeability } from "@plaintx/chain";
import { type RankedApproval, revokeTransaction, UNLIMITED_THRESHOLD } from "@plaintx/core";
import type { ScanRow } from "./types";

/** Turns a ranked approval into a JSON-safe row, with its revoke transaction ready. */
export function toRow({ approval, spender, verdict }: RankedApproval): ScanRow {
  const asset = approval.kind === "nft-all" ? approval.collection : approval.token;
  const upgrades = describeUpgradeability(spender.upgradeability);
  return {
    id: `${approval.kind}:${asset}:${approval.spender}`.toLowerCase(),
    kind: approval.kind,
    asset,
    spender: approval.spender,
    ...(spender.name ? { spenderName: spender.name } : {}),
    ...(spender.status ? { spenderStatus: spender.status } : {}),
    spenderIsContract: spender.isContract,
    amount:
      approval.kind === "nft-all"
        ? "all"
        : approval.amount >= UNLIMITED_THRESHOLD
          ? "unlimited"
          : "limited",
    ...(approval.kind === "permit2" ? { expiration: approval.expiration } : {}),
    verdict,
    ...(upgrades ? { upgrades } : {}),
    ...(spender.listedBy ? { listedBy: spender.listedBy } : {}),
    revoke: revokeTransaction(approval),
  };
}
