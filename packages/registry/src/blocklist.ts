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
  /**
   * Checks many addresses at once, for lists where each call has a cost (a database, a live
   * service). Answers every address asked about, keyed by the caller's spelling. Optional:
   * `checkAll` falls back to `check` per address.
   */
  checkMany?(
    chainId: number,
    addresses: readonly Address[],
  ): Promise<Map<Address, BlocklistResult>>;
}

/**
 * Checks every address against `list`, in one call when it supports that. Never throws: a
 * failing list makes each address "unavailable", never "not-listed".
 */
export async function checkAll(
  list: Blocklist,
  chainId: number,
  addresses: readonly Address[],
): Promise<Map<Address, BlocklistResult>> {
  const unique = [...new Set(addresses)];
  const unavailable = (): Map<Address, BlocklistResult> =>
    new Map(unique.map((a) => [a, { status: "unavailable" }]));
  if (list.checkMany) {
    const results = await list.checkMany(chainId, unique).catch(unavailable);
    // An answer that skips an address leaves it unavailable, not clean.
    return new Map(unique.map((a) => [a, results.get(a) ?? { status: "unavailable" }]));
  }
  const results = await Promise.all(
    unique.map((a) =>
      list.check(chainId, a).catch((): BlocklistResult => ({ status: "unavailable" })),
    ),
  );
  return new Map(unique.map((a, i) => [a, results[i] as BlocklistResult]));
}

/**
 * One list made of several. An address is listed if any list names it, with every list's
 * match; otherwise unavailable if any list could not answer; otherwise not listed. A list that
 * is down therefore never hides a match from the others.
 */
export function combineBlocklists(...lists: readonly Blocklist[]): Blocklist {
  const checkMany = async (chainId: number, addresses: readonly Address[]) => {
    const answers = await Promise.all(lists.map((list) => checkAll(list, chainId, addresses)));
    return new Map(
      addresses.map((address) => [
        address,
        merge(answers.map((a) => a.get(address) ?? { status: "unavailable" })),
      ]),
    );
  };
  return {
    async check(chainId, address) {
      return (await checkMany(chainId, [address])).get(address) ?? { status: "unavailable" };
    },
    checkMany,
  };
}

function merge(results: readonly BlocklistResult[]): BlocklistResult {
  const matches: BlocklistMatch[] = [];
  for (const r of results) {
    if (r.status !== "listed") continue;
    for (const m of r.matches) {
      if (!matches.some((x) => x.source === m.source && x.note === m.note)) matches.push(m);
    }
  }
  if (matches.length > 0) return { status: "listed", matches };
  if (results.some((r) => r.status === "unavailable")) return { status: "unavailable" };
  return { status: "not-listed" };
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
