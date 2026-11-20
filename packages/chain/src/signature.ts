import {
  type Address,
  assessSignature,
  assetsOf,
  MAX_CHECKED_PARTIES,
  type Party,
  partiesOf,
  type SignatureRequest,
  type SpenderInfo,
  type Verdict,
} from "@plaintx/core";
import type { Blocklist } from "@plaintx/registry";
import { type AssetInfo, readAssetInfo } from "./assets.js";
import type { ScanCache } from "./cache.js";
import type { Etherscan } from "./etherscan.js";
import { type ChainReader, readSpenderInfo } from "./state.js";

export interface SignatureCheckOptions {
  request: SignatureRequest;
  /**
   * Reads the request's chain, or null when we cannot read that chain (or the request names
   * none): the verdict then says the result is incomplete.
   */
  client: ChainReader | null;
  etherscan: Etherscan;
  /** Unix timestamp in seconds. */
  now: number;
  blocklist?: Blocklist;
  cache?: ScanCache;
  onCacheError?: (error: unknown) => void;
}

export interface SignatureReport {
  request: SignatureRequest;
  verdict: Verdict;
  /** Each address the request hands power or assets to, with what we found about it. */
  parties: (Party & { info?: SpenderInfo })[];
  /** Display details of the tokens and collections involved. */
  assets: ReadonlyMap<Address, AssetInfo>;
}

/**
 * Checks a decoded signature request: looks up every party (scam lists, registry, chain facts)
 * and the assets involved, then applies the deterministic rules in @plaintx/core.
 * Reads public chain data only; nothing is signed or sent.
 */
export async function checkSignature({
  request,
  client,
  etherscan,
  now,
  blocklist,
  cache,
  onCacheError = () => {},
}: SignatureCheckOptions): Promise<SignatureReport> {
  const parties = partiesOf(request);
  const chainId = request.chainId;
  if (!client || chainId === undefined) {
    return {
      request,
      verdict: assessSignature(request, null, now),
      parties,
      assets: new Map(),
    };
  }

  const [facts, assets] = await Promise.all([
    readSpenderInfo(
      client,
      etherscan,
      chainId,
      // Parties come in order of importance: spender and contract first.
      parties.slice(0, MAX_CHECKED_PARTIES).map((p) => p.address),
      blocklist,
      cache,
      onCacheError,
    ),
    readAssetInfo(client, chainId, assetsOf(request), cache, onCacheError),
  ]);
  return {
    request,
    verdict: assessSignature(request, facts, now),
    parties: parties.map((p) => {
      const info = facts.get(p.address);
      return info ? { ...p, info } : p;
    }),
    assets,
  };
}
