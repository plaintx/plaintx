import type { Address, SpenderStatus } from "@plaintx/core";
import { KNOWN_SPENDERS } from "./spenders.js";

/** Chains PlainTx supports: Ethereum, Base, Arbitrum One. */
export const SUPPORTED_CHAINS = [1, 8453, 42161] as const;
export type ChainId = (typeof SUPPORTED_CHAINS)[number];

export type SpenderKind =
  | "dex-router"
  | "allowance-manager"
  | "settlement-relayer"
  | "nft-marketplace"
  | "nft-conduit";

/**
 * One app contract at one address. See docs/decisions/0005-spender-registry.md for what it
 * takes to be listed.
 */
export interface KnownSpender {
  /** Chains where this exact address is this contract. Same address on another chain is not implied. */
  chains: readonly ChainId[];
  address: Address;
  name: string;
  protocol: string;
  kind: SpenderKind;
  status: SpenderStatus;
  /**
   * At least two GitHub permalinks, pinned to a commit, from at least two of the protocol's own
   * repositories. Each one must contain the address and tie it to the listed chains.
   */
  sources: readonly string[];
  /** Why the status is not "active", with a link. */
  statusNote?: string;
  /** ISO date the entry was added or last reviewed. */
  reviewedAt: string;
}

const index = new Map<string, KnownSpender>();
for (const spender of KNOWN_SPENDERS) {
  for (const chainId of spender.chains) index.set(key(chainId, spender.address), spender);
}

/** The registry entry for this address on this chain, if there is one. Exact match only. */
export function lookupSpender(chainId: number, address: Address): KnownSpender | undefined {
  return index.get(key(chainId, address));
}

function key(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}
