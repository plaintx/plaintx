/**
 * Verdict levels. There is deliberately no "safe" level: the best PlainTx can
 * say is that no known risks were found (see docs/decisions/0002).
 */
export type VerdictLevel = "danger" | "caution" | "no_known_risks";

export interface Finding {
  /** Stable machine-readable id, e.g. "unlimited-approval". */
  id: string;
  level: Exclude<VerdictLevel, "no_known_risks">;
  /** Short plain-English summary shown to the user. */
  summary: string;
}

export interface Verdict {
  level: VerdictLevel;
  findings: Finding[];
}

/** The verdict is the worst finding. No findings means "no known risks". */
export function verdictFrom(findings: Finding[]): Verdict {
  if (findings.some((f) => f.level === "danger")) {
    return { level: "danger", findings };
  }
  if (findings.some((f) => f.level === "caution")) {
    return { level: "caution", findings };
  }
  return { level: "no_known_risks", findings };
}
