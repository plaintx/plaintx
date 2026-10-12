"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { countByLevel, describeProgress, SCAN_STEPS, VERDICT_LABELS } from "@/lib/format";
import { readNdjson } from "@/lib/ndjson";
import { CHAIN_OPTIONS, type ScanEvent, type ScanProgress, type ScanResult } from "@/lib/types";
import { ApprovalRow } from "./approval-row";
import { ConnectButton } from "./connect-button";

const PAGE = 50;

type State =
  | { status: "idle" }
  | { status: "scanning"; startedAt: number; progress?: ScanProgress }
  | { status: "error"; message: string }
  | { status: "done"; result: ScanResult };

export function HealthCheck() {
  const { address: connected } = useConnection();
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<string>(CHAIN_OPTIONS[0].name);
  const [state, setState] = useState<State>({ status: "idle" });
  const [revoked, setRevoked] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (connected && !address) setAddress(connected);
  }, [connected, address]);

  const onRevoked = useCallback((id: string) => setRevoked((prev) => new Set(prev).add(id)), []);

  async function scan(event: FormEvent) {
    event.preventDefault();
    const startedAt = Date.now();
    setState({ status: "scanning", startedAt });
    setRevoked(new Set());
    setShown(0);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, chain }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json();
        setState({ status: "error", message: body.error });
        return;
      }
      let finished = false;
      await readNdjson<ScanEvent>(res.body, (event) => {
        if (event.type === "progress") {
          setState({ status: "scanning", startedAt, progress: event.progress });
          return;
        }
        finished = true;
        setState(
          event.type === "result"
            ? { status: "done", result: event.result }
            : { status: "error", message: event.error },
        );
      });
      if (!finished) throw new Error("Scan stream ended early");
    } catch {
      setState({
        status: "error",
        message: "Could not reach PlainTx. Check your connection and try again.",
      });
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={scan}
        className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="address" className="text-sm font-medium">
            Wallet address
          </label>
          <ConnectButton />
        </div>
        <input
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            aria-label="Network"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {CHAIN_OPTIONS.map((c) => (
              <option
                key={c.name}
                value={c.name}
                className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!address || state.status === "scanning"}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {state.status === "scanning" ? "Checking…" : "Check approvals"}
          </button>
        </div>
      </form>

      {state.status === "scanning" && (
        <Scanning startedAt={state.startedAt} progress={state.progress} />
      )}
      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <Results
          result={state.result}
          revoked={revoked}
          onRevoked={onRevoked}
          shown={shown}
          onShowMore={() => setShown((n) => n + PAGE)}
        />
      )}
    </div>
  );
}

function Scanning({
  startedAt,
  progress,
}: {
  startedAt: number;
  progress: ScanProgress | undefined;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.floor((now - startedAt) / 1000);
  const shown = describeProgress(progress ?? { step: "history", events: 0 });
  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {/* Only the step is announced: counts change too often for a screen reader. */}
      <p aria-live="polite" className="text-sm font-medium">
        Step {shown.step} of {SCAN_STEPS}: {shown.label}…
      </p>
      <div
        role="progressbar"
        aria-label={shown.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown.fraction === undefined ? undefined : Math.round(shown.fraction * 100)}
        className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      >
        <div
          className={`h-full rounded-full bg-indigo-600 transition-[width] duration-300 ${
            shown.fraction === undefined ? "w-1/3 animate-pulse" : ""
          }`}
          style={shown.fraction === undefined ? undefined : { width: `${shown.fraction * 100}%` }}
        />
      </div>
      <p className="flex justify-between gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        <span>{shown.detail}</span>
        <span>{seconds}s</span>
      </p>
      {shown.step === 1 && seconds >= 10 && (
        <p className="text-xs text-zinc-500">
          Busy wallets can take a few minutes the first time. Later checks are much faster.
        </p>
      )}
    </div>
  );
}

function Results({
  result,
  revoked,
  onRevoked,
  shown,
  onShowMore,
}: {
  result: ScanResult;
  revoked: Set<string>;
  onRevoked: (id: string) => void;
  shown: number;
  onShowMore: () => void;
}) {
  const counts = countByLevel(result.rows);
  const risky = result.rows.filter((r) => r.verdict.level !== "no_known_risks");
  const rest = result.rows.filter((r) => r.verdict.level === "no_known_risks");
  const row = (r: ScanResult["rows"][number]) => (
    <ApprovalRow
      key={r.id}
      row={r}
      owner={result.owner}
      chainId={result.chainId}
      revoked={revoked.has(r.id)}
      onRevoked={onRevoked}
    />
  );

  if (result.rows.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This wallet has no active approvals on {result.chainName}. No app can spend its tokens or
        NFTs.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">
        {result.rows.length} active approval{result.rows.length === 1 ? "" : "s"} on{" "}
        {result.chainName}
      </h2>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-red-700 dark:text-red-300">
          {counts.danger} {VERDICT_LABELS.danger.toLowerCase()}
        </span>
        <span className="font-medium text-amber-700 dark:text-amber-300">
          {counts.caution} {VERDICT_LABELS.caution.toLowerCase()}
        </span>
        <span className="text-zinc-600 dark:text-zinc-400">
          {counts.no_known_risks} with {VERDICT_LABELS.no_known_risks.toLowerCase()}
        </span>
      </p>
      {risky.length > 0 && <ul className="space-y-3">{risky.map(row)}</ul>}
      {rest.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            {VERDICT_LABELS.no_known_risks} ({rest.length})
          </h3>
          <p className="text-xs text-zinc-500">
            These passed our checks. That is not a guarantee: revoke anything you no longer use.
          </p>
          {shown > 0 && <ul className="space-y-3">{rest.slice(0, shown).map(row)}</ul>}
          {shown < rest.length && (
            <button
              type="button"
              onClick={onShowMore}
              className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {showMoreLabel(shown, rest.length)}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function showMoreLabel(shown: number, total: number): string {
  const next = Math.min(PAGE, total - shown);
  if (shown > 0) return `Show ${next} more`;
  return next < total ? `Show ${next} of ${total}` : `Show ${total}`;
}
