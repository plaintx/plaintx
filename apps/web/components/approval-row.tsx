import type { VerdictLevel } from "@plaintx/core";
import { describePermission, explorerAddressUrl, shortAddress, VERDICT_LABELS } from "@/lib/format";
import type { ScanRow } from "@/lib/types";
import { RevokeButton } from "./revoke-button";

// "No known risks found" is grey, not green: it is not a promise that something is safe.
const BADGE: Record<VerdictLevel, string> = {
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  caution: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  no_known_risks: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

function AddressLink({
  chainId,
  address,
  label,
}: {
  chainId: number;
  address: string;
  label?: string;
}) {
  const url = explorerAddressUrl(chainId, address);
  const text = label ?? shortAddress(address);
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="font-medium hover:underline"
      title={address}
    >
      {text}
    </a>
  ) : (
    <span title={address}>{text}</span>
  );
}

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
  const notes = [
    ...(row.spenderStatus === "deprecated" ? ["The app has retired this contract."] : []),
    ...(row.upgrades ? [row.upgrades] : []),
    ...(row.listedBy ?? []).map((l) => `Listed by ${l}`),
  ];

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[row.verdict.level]}`}
          >
            {VERDICT_LABELS[row.verdict.level]}
          </span>
          <p className="mt-2 text-sm">
            <AddressLink
              chainId={chainId}
              address={row.spender}
              {...(row.spenderName ? { label: row.spenderName } : {})}
            />{" "}
            <span className="text-zinc-600 dark:text-zinc-400">
              {describePermission(row).toLowerCase()}
            </span>{" "}
            <AddressLink chainId={chainId} address={row.asset} />
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
