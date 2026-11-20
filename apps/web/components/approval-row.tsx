import { describePermission } from "@/lib/format";
import type { ScanRow } from "@/lib/types";
import { AddressLink } from "./address-link";
import { RevokeButton } from "./revoke-button";
import { VerdictBadge } from "./verdict-badge";

export function ApprovalRow({
  row,
  owner,
  chainId,
  revoked,
  onRevoked,
}: {
  row: ScanRow;
  owner: string;
  chainId: number;
  revoked: boolean;
  onRevoked: (id: string) => void;
}) {
  const permission = describePermission(row);
  const notes = [
    ...(row.spenderStatus === "deprecated" ? ["The app has retired this contract."] : []),
    ...(row.upgrades ? [row.upgrades] : []),
    ...(row.listedBy ?? []).map((l) => `Listed by ${l}`),
  ];

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <VerdictBadge level={row.verdict.level} />
          <p className="mt-2 text-sm">
            <AddressLink
              chainId={chainId}
              address={row.spender}
              {...(row.spenderName ? { label: row.spenderName } : {})}
            />{" "}
            <span className="text-zinc-600 dark:text-zinc-400">{permission.action}</span>{" "}
            <AddressLink
              chainId={chainId}
              address={row.asset}
              {...(permission.asset ? { label: permission.asset } : {})}
            />
            {permission.suffix && (
              <span className="text-zinc-600 dark:text-zinc-400"> {permission.suffix}</span>
            )}
          </p>
        </div>
        {revoked ? (
          <span className="text-sm font-medium text-zinc-500">Revoked</span>
        ) : (
          <RevokeButton row={row} owner={owner} onRevoked={onRevoked} />
        )}
      </div>
      {row.verdict.findings.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {row.verdict.findings.map((f) => (
            <li key={f.id}>{f.summary}</li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-zinc-500">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
