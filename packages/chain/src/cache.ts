import type { Address, SpenderInfo } from "@plaintx/core";
import { getAddress } from "viem";
import type { Candidate } from "./discovery.js";

/**
 * Facts about a spender that come from the chain and change rarely. Reputation is not part of
 * them: the registry and scam lists are applied fresh on every scan. See ADR 0010.
 */
export type SpenderFacts = Pick<SpenderInfo, "isContract" | "upgradeability"> & {
  verified: boolean;
};

/** Every pair a wallet has approved, as of a block. */
export interface WalletHistory {
  candidates: Candidate[];
  /** Logs up to this block were searched. */
  scannedToBlock: number;
}

/**
 * Stores slow-to-fetch scan inputs. Live allowances are never cached, so verdicts always reflect
 * the chain as it is now. Implementations decide how long spender facts stay fresh.
 */
export interface ScanCache {
  getHistory(chainId: number, owner: Address): Promise<WalletHistory | null>;
  putHistory(chainId: number, owner: Address, history: WalletHistory): Promise<void>;
  /** Fresh facts for the spenders the cache knows; missing or stale ones are left out. */
  getSpenderFacts(
    chainId: number,
    spenders: readonly Address[],
  ): Promise<Map<Address, SpenderFacts>>;
  putSpenderFacts(chainId: number, facts: ReadonlyMap<Address, SpenderFacts>): Promise<void>;
}

/** In-process cache for tests and the CLIs. Shared deployments use @plaintx/cache (Postgres). */
export function memoryCache(): ScanCache {
  const histories = new Map<string, WalletHistory>();
  const facts = new Map<string, SpenderFacts>();
  const key = (chainId: number, address: Address) => `${chainId}:${getAddress(address)}`;
  return {
    async getHistory(chainId, owner) {
      return histories.get(key(chainId, owner)) ?? null;
    },
    async putHistory(chainId, owner, history) {
      histories.set(key(chainId, owner), history);
    },
    async getSpenderFacts(chainId, spenders) {
      const found = new Map<Address, SpenderFacts>();
      for (const s of spenders) {
        const f = facts.get(key(chainId, s));
        if (f) found.set(s, f);
      }
      return found;
    },
    async putSpenderFacts(chainId, entries) {
      for (const [s, f] of entries) facts.set(key(chainId, s), f);
    },
  };
}
