"use client";

import { useEffect } from "react";
import {
  useConnection,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";
import { explorerTxUrl, shortAddress } from "@/lib/format";
import type { ScanRow, SupportedChainId } from "@/lib/types";

/**
 * Hands the unsigned revoke transaction to the user's wallet. Only the wallet that gave the
 * approval can remove it, so the button asks for that wallet and network first.
 */
export function RevokeButton({
  row,
  owner,
  onRevoked,
}: {
  row: ScanRow;
  owner: string;
  onRevoked: (id: string) => void;
}) {
  const { address, chainId: walletChainId, isConnected } = useConnection();
  const chainId = row.revoke.chainId as SupportedChainId;
  const { mutate: switchChain, isPending: switching } = useSwitchChain();
  const send = useSendTransaction();
  const receipt = useWaitForTransactionReceipt({
    hash: send.data,
    chainId,
  });

  const confirmed = receipt.data?.status === "success";
  useEffect(() => {
    if (confirmed) onRevoked(row.id);
  }, [confirmed, onRevoked, row.id]);

  const button =
    "rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";

  if (!isConnected) {
    return <span className="text-xs text-zinc-500">Connect your wallet to revoke</span>;
  }
  if (address?.toLowerCase() !== owner.toLowerCase()) {
    return (
      <span className="text-xs text-zinc-500">
        Switch to {shortAddress(owner)} in your wallet to revoke
      </span>
    );
  }
  if (walletChainId !== chainId) {
    return (
      <button
        type="button"
        disabled={switching}
        onClick={() => switchChain({ chainId })}
        className={`${button} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900`}
      >
        {switching ? "Switching…" : "Switch network"}
      </button>
    );
  }

  const txUrl = send.data ? explorerTxUrl(chainId, send.data) : null;
  const status =
    receipt.isError || receipt.data?.status === "reverted"
      ? "failed"
      : send.data
        ? "pending"
        : send.isPending
          ? "confirm"
          : "idle";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={status === "confirm" || status === "pending"}
        onClick={() =>
          send.mutate({
            to: row.revoke.to,
            data: row.revoke.data,
            chainId,
          })
        }
        className={`${button} bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300`}
      >
        {status === "confirm"
          ? "Confirm in wallet…"
          : status === "pending"
            ? "Revoking…"
            : "Revoke"}
      </button>
      {send.error && !send.data && (
        <span className="text-xs text-zinc-500">
          Not sent: cancelled or rejected by the wallet.
        </span>
      )}
      {status === "failed" && <span className="text-xs text-red-600">The transaction failed.</span>}
      {txUrl && (
        <a
          href={txUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          View transaction
        </a>
      )}
    </div>
  );
}
