"use client";

import { useConnect, useConnection, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected } = useConnection();
  const { mutate: connect, connectors, isPending, error } = useConnect();
  const { mutate: disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-full bg-zinc-200 px-3 py-1 font-mono dark:bg-zinc-800">
          {shortAddress(address)}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="text-zinc-500 underline-offset-2 hover:underline"
        >
          Disconnect
        </button>
      </div>
    );
  }

  const connector = connectors[0];
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={!connector || isPending}
        onClick={() => connector && connect({ connector })}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {error && (
        <span className="text-xs text-zinc-500">
          No browser wallet found, or the request was declined.
        </span>
      )}
    </div>
  );
}
