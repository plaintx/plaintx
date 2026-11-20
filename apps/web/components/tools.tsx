"use client";

import { type KeyboardEvent, useEffect, useState } from "react";
import { HealthCheck } from "./health-check";
import { SignatureCheck } from "./signature-check";

const TOOLS = [
  {
    id: "health",
    tab: "Wallet health check",
    intro:
      "See which apps can spend your tokens and NFTs, riskiest first, and remove the ones you don't need. We never ask for your seed phrase or private key: revoking happens in your own wallet.",
  },
  {
    id: "signature",
    tab: "Check a signature",
    intro:
      "A website asked you to sign something? Paste it here before you sign to see, in plain words, what it would let someone do. Scammers use signatures to take tokens and NFTs without a transaction.",
  },
] as const;

type ToolId = (typeof TOOLS)[number]["id"];

/** The two tools as tabs. `#signature` in the URL opens the signature check. */
export function Tools() {
  const [active, setActive] = useState<ToolId>("health");

  useEffect(() => {
    if (window.location.hash === "#signature") setActive("signature");
  }, []);

  function select(id: ToolId) {
    setActive(id);
    window.history.replaceState(null, "", id === "health" ? window.location.pathname : `#${id}`);
  }

  // Arrow keys move between tabs, as screen reader users expect of a tab list.
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const i = TOOLS.findIndex((t) => t.id === active);
    const next = TOOLS[(i + (event.key === "ArrowRight" ? 1 : TOOLS.length - 1)) % TOOLS.length];
    if (!next) return;
    select(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  const tool = TOOLS.find((t) => t.id === active) ?? TOOLS[0];
  return (
    <>
      <div
        role="tablist"
        aria-label="Tools"
        onKeyDown={onKeyDown}
        className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        {TOOLS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={t.id === active}
            aria-controls={`panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            onClick={() => select(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              t.id === active
                ? "border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300"
                : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {t.tab}
          </button>
        ))}
      </div>
      <p className="mb-6 text-zinc-600 dark:text-zinc-400">{tool.intro}</p>
      {/* Both stay mounted, so switching tabs keeps a finished scan or check. */}
      {TOOLS.map((t) => (
        <div
          key={t.id}
          id={`panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active}
        >
          {t.id === "health" ? <HealthCheck /> : <SignatureCheck />}
        </div>
      ))}
    </>
  );
}
