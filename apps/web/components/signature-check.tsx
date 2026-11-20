"use client";

import { type FormEvent, useState } from "react";
import { VERDICT_LABELS } from "@/lib/format";
import { SIGNATURE_EXAMPLES } from "@/lib/signature-examples";
import type { Line, SignatureResult } from "@/lib/signature-view";
import { AddressLink } from "./address-link";
import { VerdictBadge } from "./verdict-badge";

type State =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "error"; message: string }
  | { status: "done"; result: SignatureResult };

export function SignatureCheck() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  async function check(text: string) {
    setState({ status: "checking" });
    try {
      const res = await fetch("/api/signature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: text }),
      });
      const body = (await res.json()) as { result?: SignatureResult; error?: string };
      setState(
        body.result
          ? { status: "done", result: body.result }
          : { status: "error", message: body.error ?? "The check could not finish." },
      );
    } catch {
      setState({
        status: "error",
        message: "Could not reach PlainTx. Check your connection and try again.",
      });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void check(input);
  }

  function tryExample(index: number) {
    const example = SIGNATURE_EXAMPLES[index];
    if (!example) return;
    const text = JSON.stringify(example.build(Math.floor(Date.now() / 1000)), null, 2);
    setInput(text);
    void check(text);
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <label htmlFor="signature" className="text-sm font-medium">
          Signature request (EIP-712 JSON)
        </label>
        <textarea
          id="signature"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='{"types": {…}, "domain": {…}, "primaryType": "…", "message": {…}}'
          rows={8}
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-indigo-500 dark:border-zinc-700"
        />
        <p className="text-xs text-zinc-500">
          Paste the data your wallet asks you to sign. Checking it signs nothing and sends nothing
          to the blockchain. We don't store it.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!input.trim() || state.status === "checking"}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {state.status === "checking" ? "Checking…" : "Check signature"}
          </button>
          <span className="text-xs text-zinc-500">Try an example:</span>
          {SIGNATURE_EXAMPLES.map((example, i) => (
            <button
              key={example.label}
              type="button"
              onClick={() => tryExample(i)}
              disabled={state.status === "checking"}
              className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
            >
              {example.label}
            </button>
          ))}
        </div>
      </form>

      {state.status === "checking" && (
        <p aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-400">
          Checking the addresses in this request…
        </p>
      )}
      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {state.message}
        </p>
      )}
      {state.status === "done" && <Result result={state.result} />}
    </div>
  );
}

function Result({ result }: { result: SignatureResult }) {
  const chainId = result.chainId ?? 0;
  const { level, findings } = result.verdict;
  return (
    <section
      aria-label="Signature check result"
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <VerdictBadge level={level} />
        <h2 className="mt-2 text-lg font-semibold">{result.title}</h2>
        {result.chainLabel && <p className="text-xs text-zinc-500">On {result.chainLabel}</p>}
      </div>

      <div>
        <h3 className="text-sm font-semibold">If you sign</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {result.lines.map((line, i) => (
            // Lines have no stable id, and the list never reorders.
            // biome-ignore lint/suspicious/noArrayIndexKey: static list
            <li key={i}>
              <LineText line={line} chainId={chainId} />
            </li>
          ))}
        </ul>
        {result.validity && (
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{result.validity}</p>
        )}
      </div>

      {findings.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">What we found</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {findings.map((f) => (
              <li
                key={f.id}
                className={f.level === "danger" ? "text-red-800 dark:text-red-300" : undefined}
              >
                {f.summary}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {VERDICT_LABELS.no_known_risks}. That is not a guarantee: only sign requests you started
          yourself, on a website you opened yourself.
        </p>
      )}

      {level === "danger" && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
          Do not sign this. Close the website that asked for it. If you already signed, check your
          wallet's approvals in the Wallet health check and remove any you don't recognize.
        </p>
      )}

      {result.parties.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Addresses we checked</h3>
          <ul className="mt-1 space-y-1 text-xs">
            {result.parties.map((p) => (
              <li key={p.address} className="flex flex-wrap gap-x-2">
                <span className="text-zinc-500">{p.role}:</span>
                <AddressLink
                  chainId={chainId}
                  address={p.address}
                  {...(p.name ? { label: p.name } : {})}
                />
                {p.isContract === false && (
                  <span className="text-zinc-500">(a personal wallet)</span>
                )}
                {p.listedBy?.map((l) => (
                  <span key={l} className="text-red-700 dark:text-red-300">
                    Listed by {l}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          {!result.checked && (
            <p className="mt-1 text-xs text-zinc-500">
              We can't read this network yet, so these addresses were not checked.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function LineText({ line, chainId }: { line: Line; chainId: number }) {
  return (
    <>
      {line.map((part, i) =>
        typeof part === "string" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed sentence
          <span key={i}>{part}</span>
        ) : (
          <AddressLink
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed sentence
            key={i}
            chainId={chainId}
            address={part.address}
            {...(part.label ? { label: part.label } : {})}
          />
        ),
      )}
    </>
  );
}
