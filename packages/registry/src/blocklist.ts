import type { Address } from "@plaintx/core";
import { BLOCKLIST_ENTRIES } from "./blocklist-data.js";

/** Lists bundled with PlainTx. See docs/decisions/0008-scam-blocklist.md. */
export const BLOCKLIST_SOURCES = {
  "mew-darklist": {
    name: "MyEtherWallet darklist",
    url: "https://github.com/MyEtherWallet/ethereum-lists/blob/8f86cba9b58db79608ece8fa784775b3c41e2e26/src/addresses/addresses-darklist.json",
    license: "MIT",
  },
  "forta-labelled-datasets": {
    name: "Forta labelled datasets",
    url: "https://github.com/forta-network/labelled-datasets/blob/40a9c2f2bd7e9ddfdd0f3540db589f0288e1e88a/labels/1/malicious_smart_contracts.csv",
    license: "MIT",
  },
} as const;

export type BlocklistSource = keyof typeof BLOCKLIST_SOURCES;

/** [address in lower case, source, note from the source] */
export type BlocklistEntry = readonly [address: string, source: BlocklistSource, note: string];

export interface BlocklistMatch {
  /** Name of the list, e.g. "MyEtherWallet darklist", or of a live service. */
  source: string;
  note: string;
}

/**
 * "unavailable" means the list could not be asked (e.g. a live service is down). Callers must
 * never treat it as "not-listed".
 */
export type BlocklistResult =
  | { status: "listed"; matches: BlocklistMatch[] }
  | { status: "not-listed" }
  | { status: "unavailable" };

/**
 * Anything that can say whether an address is a known scam. The bundled lists implement it
 * today; a live service becomes another implementation.
 */
export interface Blocklist {
  check(chainId: number, address: Address): Promise<BlocklistResult>;
}

/** The bundled lists only cover Ethereum. */
const BUNDLED_CHAINS = new Set([1]);

const index = new Map(BLOCKLIST_ENTRIES.map((entry) => [entry[0], entry]));

/** Lists bundled in this package. Never "unavailable". */
export const bundledBlocklist: Blocklist = {
  async check(chainId, address) {
    const entry = BUNDLED_CHAINS.has(chainId) ? index.get(address.toLowerCase()) : undefined;
    if (!entry) return { status: "not-listed" };
    const [, source, note] = entry;
    return { status: "listed", matches: [{ source: BLOCKLIST_SOURCES[source].name, note }] };
  },
};
