import type { VerdictLevel } from "@plaintx/core";
import { VERDICT_LABELS } from "@/lib/format";

// "No known risks found" is grey, not green: it is not a promise that something is safe.
const BADGE: Record<VerdictLevel, string> = {
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  caution: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  no_known_risks: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function VerdictBadge({ level }: { level: VerdictLevel }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[level]}`}
    >
      {VERDICT_LABELS[level]}
    </span>
  );
}
