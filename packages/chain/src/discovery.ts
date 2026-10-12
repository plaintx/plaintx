import { type Address, PERMIT2 } from "@plaintx/core";
import { getAddress, pad, toEventSelector } from "viem";
import { type Etherscan, type EtherscanLog, PAGE_SIZE } from "./etherscan.js";

/** ERC-20 and ERC-721 share this signature; ERC-721's has a fourth topic (tokenId). */
const APPROVAL = toEventSelector("Approval(address,address,uint256)");
const APPROVAL_FOR_ALL = toEventSelector("ApprovalForAll(address,address,bool)");
const PERMIT2_APPROVAL = toEventSelector("Approval(address,address,address,uint160,uint48)");
const PERMIT2_PERMIT = toEventSelector("Permit(address,address,address,uint160,uint48,uint48)");

/** A token/spender pair the wallet approved at some point. It may since have been revoked. */
export type Candidate =
  | { kind: "erc20"; token: Address; spender: Address }
  | { kind: "nft-all"; collection: Address; spender: Address }
  | { kind: "permit2"; token: Address; spender: Address };

/**
 * Finds every pair the owner has approved on this chain since `fromBlock`, from event logs.
 * The default searches the whole history.
 */
export async function findCandidates(
  etherscan: Etherscan,
  chainId: number,
  owner: Address,
  fromBlock = 0,
): Promise<Candidate[]> {
  const topic1 = pad(owner).toLowerCase() as `0x${string}`;
  const searches: { topic0: `0x${string}`; address?: Address }[] = [
    { topic0: APPROVAL },
    { topic0: APPROVAL_FOR_ALL },
    { topic0: PERMIT2_APPROVAL, address: PERMIT2 },
    { topic0: PERMIT2_PERMIT, address: PERMIT2 },
  ];

  const found: Candidate[] = [];
  for (const search of searches) {
    for (const log of await allLogs(etherscan, { chainId, topic1, ...search }, fromBlock)) {
      const candidate = toCandidate(log, search.topic0);
      if (candidate) found.push(candidate);
    }
  }
  return mergeCandidates(found);
}

/** Combines candidate lists, keeping one of each token/spender pair. */
export function mergeCandidates(...lists: readonly (readonly Candidate[])[]): Candidate[] {
  const found = new Map<string, Candidate>();
  for (const list of lists) for (const c of list) found.set(keyOf(c), c);
  return [...found.values()];
}

/**
 * Etherscan pages are capped, so walk forward by block number. The next request starts at the
 * last block seen; logs in that block come back twice, which is harmless because we dedupe.
 */
async function allLogs(
  etherscan: Etherscan,
  query: Omit<Parameters<Etherscan["getLogs"]>[0], "fromBlock">,
  startBlock: number,
): Promise<EtherscanLog[]> {
  const logs: EtherscanLog[] = [];
  let fromBlock = startBlock;
  for (;;) {
    const page = await etherscan.getLogs({ ...query, fromBlock });
    logs.push(...page);
    const last = page.at(-1);
    if (page.length < PAGE_SIZE || !last) return logs;
    const lastBlock = Number(last.blockNumber);
    // A single block with a full page of matches would loop forever; skip past it.
    fromBlock = lastBlock > fromBlock ? lastBlock : fromBlock + 1;
  }
}

function toCandidate(log: EtherscanLog, topic0: `0x${string}`): Candidate | null {
  const [, , second, third] = log.topics;
  switch (topic0) {
    case APPROVAL:
      // Four topics means an ERC-721 approval of a single token id, which is out of scope.
      if (log.topics.length !== 3 || !second) return null;
      return { kind: "erc20", token: getAddress(log.address), spender: topicAddress(second) };
    case APPROVAL_FOR_ALL:
      if (!second) return null;
      return {
        kind: "nft-all",
        collection: getAddress(log.address),
        spender: topicAddress(second),
      };
    default:
      if (!second || !third) return null;
      return { kind: "permit2", token: topicAddress(second), spender: topicAddress(third) };
  }
}

function topicAddress(topic: `0x${string}`): Address {
  return getAddress(`0x${topic.slice(-40)}`);
}

function keyOf(c: Candidate): string {
  return `${c.kind}:${c.kind === "nft-all" ? c.collection : c.token}:${c.spender}`;
}
