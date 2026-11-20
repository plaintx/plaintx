import {
  type Address,
  LONG_EXPIRY_SECONDS,
  type SpenderInfo,
  UNLIMITED_THRESHOLD,
} from "./approvals.js";
import { PERMIT2 } from "./revoke.js";
import type { Struct, TypedData, TypedDataField, TypedValue } from "./typed-data.js";
import { type Finding, type Verdict, verdictFrom } from "./verdict.js";

/**
 * What a signature request would let someone do, read from its EIP-712 typed data. Only
 * requests whose exact shape we know are decoded; anything else is "unknown".
 * See docs/decisions/0016-signature-explainer.md.
 */
export type SignatureRequest =
  | {
      /** EIP-2612 `permit` (or DAI's older variant): a token allowance, granted by signature. */
      kind: "permit";
      standard: "eip2612" | "dai";
      chainId?: number;
      /** The token: the domain's verifying contract. */
      token: Address;
      spender: Address;
      /** 0 removes the permission. DAI's `allowed: true` is the maximum. */
      amount: bigint;
      /** Unix seconds after which the signature can no longer be used. */
      deadline: bigint;
    }
  | {
      /** Permit2 `PermitSingle` / `PermitBatch`: allowances held in the Permit2 contract. */
      kind: "permit2-allowance";
      chainId?: number;
      contract?: Address;
      spender: Address;
      permits: { token: Address; amount: bigint; expiration: bigint }[];
      deadline: bigint;
    }
  | {
      /** Permit2 `PermitTransferFrom` and its batch and witness forms: a one-time transfer. */
      kind: "permit2-transfer";
      chainId?: number;
      contract?: Address;
      spender: Address;
      transfers: { token: Address; amount: bigint }[];
      deadline: bigint;
      /** Name of the extra data type an app attached (e.g. a UniswapX order). */
      witness?: string;
    }
  | {
      /** Seaport `OrderComponents` (a listing or offer), or a `BulkOrder` of several. */
      kind: "seaport-order";
      chainId?: number;
      contract?: Address;
      orders: SeaportOrder[];
    }
  | {
      kind: "unknown";
      chainId?: number;
      contract?: Address;
      primaryType: string;
      /** The domain's name, as the requesting app set it. Not verified. */
      appName?: string;
      /** Addresses found in the message, checked against scam lists. */
      addresses: Address[];
    };

/** Seaport item types. */
export const SEAPORT_ITEM = {
  native: 0,
  erc20: 1,
  erc721: 2,
  erc1155: 3,
  erc721Criteria: 4,
  erc1155Criteria: 5,
} as const;

export interface SeaportItem {
  itemType: number;
  token: Address;
  identifierOrCriteria: bigint;
  startAmount: bigint;
  endAmount: bigint;
}

export interface SeaportOrder {
  /** The account that signs: it gives the offer and receives its share of the consideration. */
  offerer: Address;
  zone: Address;
  offer: SeaportItem[];
  consideration: (SeaportItem & { recipient: Address })[];
  startTime: bigint;
  endTime: bigint;
}

/** Unknown requests: at most this many addresses from the message are checked. */
export const MAX_UNKNOWN_ADDRESSES = 10;

/**
 * At most this many parties are looked up per request: each costs RPC and Etherscan calls, and
 * a crafted bulk order could name hundreds. The rest raise `unchecked-addresses`.
 */
export const MAX_CHECKED_PARTIES = 12;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type Shape = Record<string, string>;

const EIP2612: Shape = {
  owner: "address",
  spender: "address",
  value: "uint256",
  nonce: "uint256",
  deadline: "uint256",
};
const DAI_PERMIT: Shape = {
  holder: "address",
  spender: "address",
  nonce: "uint256",
  expiry: "uint256",
  allowed: "bool",
};
const PERMIT_DETAILS: Shape = {
  token: "address",
  amount: "uint160",
  expiration: "uint48",
  nonce: "uint48",
};
const TOKEN_PERMISSIONS: Shape = { token: "address", amount: "uint256" };
const OFFER_ITEM: Shape = {
  itemType: "uint8",
  token: "address",
  identifierOrCriteria: "uint256",
  startAmount: "uint256",
  endAmount: "uint256",
};
const CONSIDERATION_ITEM: Shape = { ...OFFER_ITEM, recipient: "address" };
const ORDER_COMPONENTS: Shape = {
  offerer: "address",
  zone: "address",
  offer: "OfferItem[]",
  consideration: "ConsiderationItem[]",
  orderType: "uint8",
  startTime: "uint256",
  endTime: "uint256",
  zoneHash: "bytes32",
  salt: "uint256",
  conduitKey: "bytes32",
  counter: "uint256",
};

/**
 * Struct names are part of the hash a contract checks, so a Permit2 or Seaport request that
 * renames them could not be used there. Matching on names and fields is therefore exact enough.
 */
function hasShape(types: TypedData["types"], name: string, shape: Shape): boolean {
  const fields: readonly TypedDataField[] | undefined = types[name];
  if (!fields || fields.length !== Object.keys(shape).length) return false;
  return fields.every((f) => shape[f.name] === f.type);
}

/** Reads the request's meaning. Pure: makes no network calls. */
export function decodeSignature(data: TypedData): SignatureRequest {
  const { domain, types, primaryType, message: m } = data;
  const base = {
    ...(domain.chainId !== undefined ? { chainId: domain.chainId } : {}),
    ...(domain.verifyingContract ? { contract: domain.verifyingContract } : {}),
  };

  if (primaryType === "Permit" && domain.verifyingContract) {
    if (hasShape(types, "Permit", EIP2612)) {
      return {
        kind: "permit",
        standard: "eip2612",
        ...chain(domain.chainId),
        token: domain.verifyingContract,
        spender: m.spender as Address,
        amount: m.value as bigint,
        deadline: m.deadline as bigint,
      };
    }
    if (hasShape(types, "Permit", DAI_PERMIT)) {
      return {
        kind: "permit",
        standard: "dai",
        ...chain(domain.chainId),
        token: domain.verifyingContract,
        spender: m.spender as Address,
        amount: m.allowed ? 2n ** 256n - 1n : 0n,
        // DAI: an expiry of 0 means the signature never expires.
        deadline: m.expiry === 0n ? 2n ** 256n - 1n : (m.expiry as bigint),
      };
    }
  }

  if (hasShape(types, "PermitDetails", PERMIT_DETAILS)) {
    const single = { details: "PermitDetails", spender: "address", sigDeadline: "uint256" };
    const batch = { ...single, details: "PermitDetails[]" };
    if (
      (primaryType === "PermitSingle" && hasShape(types, primaryType, single)) ||
      (primaryType === "PermitBatch" && hasShape(types, primaryType, batch))
    ) {
      const details = Array.isArray(m.details) ? m.details : [m.details];
      return {
        kind: "permit2-allowance",
        ...base,
        spender: m.spender as Address,
        permits: (details as Struct[]).map((d) => ({
          token: d.token as Address,
          amount: d.amount as bigint,
          expiration: d.expiration as bigint,
        })),
        deadline: m.sigDeadline as bigint,
      };
    }
  }

  if (hasShape(types, "TokenPermissions", TOKEN_PERMISSIONS)) {
    const transfer = permit2Transfer(data);
    if (transfer) return { kind: "permit2-transfer", ...base, ...transfer };
  }

  if (hasShape(types, "OfferItem", OFFER_ITEM)) {
    if (
      hasShape(types, "ConsiderationItem", CONSIDERATION_ITEM) &&
      hasShape(types, "OrderComponents", ORDER_COMPONENTS)
    ) {
      if (primaryType === "OrderComponents") {
        return { kind: "seaport-order", ...base, orders: [seaportOrder(m)] };
      }
      // A bulk order signs a Merkle tree of orders: `tree` is OrderComponents nested in arrays.
      const tree = types[primaryType];
      if (
        primaryType === "BulkOrder" &&
        tree?.length === 1 &&
        tree[0]?.name === "tree" &&
        /^OrderComponents(\[2\])+$/.test(tree[0].type)
      ) {
        const orders = flatten(m.tree ?? []).map(seaportOrder);
        // Seaport pads the tree with empty orders; they give and take nothing.
        return {
          kind: "seaport-order",
          ...base,
          orders: orders.filter((o) => o.offer.length > 0 || o.consideration.length > 0),
        };
      }
    }
  }

  return {
    kind: "unknown",
    ...base,
    primaryType,
    ...(domain.name ? { appName: domain.name } : {}),
    addresses: addressesIn(m, data.signer).slice(0, MAX_UNKNOWN_ADDRESSES),
  };
}

function chain(chainId: number | undefined): { chainId?: number } {
  return chainId !== undefined ? { chainId } : {};
}

function permit2Transfer(
  data: TypedData,
): Omit<
  Extract<SignatureRequest, { kind: "permit2-transfer" }>,
  "kind" | "chainId" | "contract"
> | null {
  const { types, primaryType, message: m } = data;
  const fields = types[primaryType];
  if (!fields) return null;
  const forms: Record<string, string> = {
    PermitTransferFrom: "TokenPermissions",
    PermitBatchTransferFrom: "TokenPermissions[]",
    PermitWitnessTransferFrom: "TokenPermissions",
    PermitBatchWitnessTransferFrom: "TokenPermissions[]",
  };
  const permitted = forms[primaryType];
  if (!permitted) return null;
  const shape: Shape = {
    permitted,
    spender: "address",
    nonce: "uint256",
    deadline: "uint256",
  };
  const witness = primaryType.includes("Witness")
    ? fields.find((f) => !(f.name in shape))
    : undefined;
  if (witness) shape[witness.name] = witness.type;
  if (primaryType.includes("Witness") && !witness) return null;
  if (!hasShape(types, primaryType, shape)) return null;

  const list = Array.isArray(m.permitted) ? m.permitted : [m.permitted];
  return {
    spender: m.spender as Address,
    transfers: (list as Struct[]).map((p) => ({
      token: p.token as Address,
      amount: p.amount as bigint,
    })),
    deadline: m.deadline as bigint,
    ...(witness ? { witness: witness.type } : {}),
  };
}

function seaportOrder(value: TypedValue): SeaportOrder {
  const o = value as Struct;
  const item = (raw: TypedValue): SeaportItem => {
    const i = raw as Struct;
    return {
      itemType: Number(i.itemType),
      token: i.token as Address,
      identifierOrCriteria: i.identifierOrCriteria as bigint,
      startAmount: i.startAmount as bigint,
      endAmount: i.endAmount as bigint,
    };
  };
  return {
    offerer: o.offerer as Address,
    zone: o.zone as Address,
    offer: (o.offer as TypedValue[]).map(item),
    consideration: (o.consideration as TypedValue[]).map((c) => ({
      ...item(c),
      recipient: (c as Struct).recipient as Address,
    })),
    startTime: o.startTime as bigint,
    endTime: o.endTime as bigint,
  };
}

function flatten(value: TypedValue): TypedValue[] {
  return Array.isArray(value) ? value.flatMap(flatten) : [value];
}

/** Every distinct address in a value, in order, except the zero address and the signer. */
function addressesIn(value: TypedValue, signer: Address | undefined): Address[] {
  const found = new Set<Address>();
  const walk = (v: TypedValue) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v).forEach(walk);
    else if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) found.add(v as Address);
  };
  walk(value);
  found.delete(ZERO_ADDRESS);
  if (signer) found.delete(signer);
  return [...found];
}

/** Who receives what a party can do, for checking each against scam lists and the chain. */
export type PartyRole = "spender" | "contract" | "recipient" | "zone" | "mentioned";

export interface Party {
  address: Address;
  role: PartyRole;
}

/** The addresses a request hands power or assets to. These are the ones worth checking. */
export function partiesOf(request: SignatureRequest): Party[] {
  const parties: Party[] = [];
  const add = (address: Address | undefined, role: PartyRole) => {
    if (!address || address === ZERO_ADDRESS) return;
    if (parties.some((p) => p.address === address)) return;
    parties.push({ address, role });
  };
  switch (request.kind) {
    case "permit":
      add(request.spender, "spender");
      break;
    case "permit2-allowance":
    case "permit2-transfer":
      add(request.spender, "spender");
      add(request.contract, "contract");
      break;
    case "seaport-order":
      add(request.contract, "contract");
      for (const order of request.orders) {
        for (const c of order.consideration) {
          if (c.recipient !== order.offerer) add(c.recipient, "recipient");
        }
        add(order.zone, "zone");
      }
      break;
    case "unknown":
      add(request.contract, "contract");
      for (const address of request.addresses) add(address, "mentioned");
      break;
  }
  return parties;
}

/** Tokens and collections the request moves or permits, for display names. */
export function assetsOf(request: SignatureRequest): Address[] {
  switch (request.kind) {
    case "permit":
      return [request.token];
    case "permit2-allowance":
      return request.permits.map((p) => p.token);
    case "permit2-transfer":
      return request.transfers.map((t) => t.token);
    case "seaport-order":
      return request.orders
        .flatMap((o) => [...o.offer, ...o.consideration])
        .filter((i) => i.itemType !== SEAPORT_ITEM.native)
        .map((i) => i.token);
    case "unknown":
      return [];
  }
}

/** Listings and permissions that stay open longer than this get flagged. */
export const LONG_LISTING_SECONDS = LONG_EXPIRY_SECONDS;

const ROLE_NAMES: Record<PartyRole, string> = {
  spender: "The address that would get permission",
  contract: "The contract this signature is for",
  recipient: "An address that would receive part of the payment",
  zone: "The order's zone contract",
  mentioned: "An address in this request",
};

/**
 * Runs every signature rule. `facts` has what was learned about each party (registry, scam
 * lists, chain); null means this network could not be checked. `now` is unix seconds.
 */
export function assessSignature(
  request: SignatureRequest,
  facts: ReadonlyMap<Address, SpenderInfo> | null,
  now: number,
): Verdict {
  const findings: Finding[] = [];
  const at = BigInt(now);

  if (!facts) {
    findings.push({
      id: "unchecked-network",
      level: "caution",
      summary:
        "We can't check addresses on this request's network yet, so this result is incomplete.",
    });
  }

  let unavailable = false;
  for (const party of partiesOf(request)) {
    const info = facts?.get(party.address);
    if (info?.reputation === "malicious") {
      findings.push({
        id: `malicious-${party.role}`,
        level: "danger",
        summary: `${ROLE_NAMES[party.role]} is on a list of known scam or drainer addresses.`,
      });
    } else if (info?.blocklistUnavailable) {
      unavailable = true;
    }
  }
  if (facts && partiesOf(request).some((p) => !facts.has(p.address))) {
    findings.push({
      id: "unchecked-addresses",
      level: "caution",
      summary: "This request names more addresses than we check at once, so some were not checked.",
    });
  }
  if (unavailable) {
    findings.push({
      id: "blocklist-unavailable",
      level: "caution",
      summary:
        "We couldn't check every address against scam lists right now. Try again before signing.",
    });
  }

  switch (request.kind) {
    case "permit":
    case "permit2-allowance":
    case "permit2-transfer":
      findings.push(...permitFindings(request, facts?.get(request.spender), at));
      break;
    case "seaport-order":
      findings.push(...seaportFindings(request, facts, at));
      break;
    case "unknown":
      findings.push({
        id: "unrecognized-signature",
        level: "caution",
        summary:
          "We don't recognize this kind of signature, so we can't tell what it lets someone do. Only sign it on a website you trust and opened yourself.",
      });
      break;
  }
  return verdictFrom(findings);
}

type PermitRequest = Extract<
  SignatureRequest,
  { kind: "permit" | "permit2-allowance" | "permit2-transfer" }
>;

function permitFindings(
  request: PermitRequest,
  spender: SpenderInfo | undefined,
  now: bigint,
): Finding[] {
  const amounts =
    request.kind === "permit"
      ? [request.amount]
      : request.kind === "permit2-allowance"
        ? request.permits.map((p) => p.amount)
        : request.transfers.map((t) => t.amount);
  // Setting an allowance to 0 only removes a permission.
  if (amounts.every((a) => a === 0n)) return [];

  const findings: Finding[] = [];
  if (
    (request.kind === "permit2-allowance" || request.kind === "permit2-transfer") &&
    request.contract !== PERMIT2
  ) {
    findings.push({
      id: "unofficial-permit2",
      level: "caution",
      summary:
        "This looks like a Permit2 signature, but it is not for the official Permit2 contract.",
    });
  }

  if (spender) {
    if (spender.status === "compromised") {
      findings.push({
        id: "compromised-spender",
        level: "danger",
        summary:
          "This app's contract was hacked or taken over. Signing would let it take your tokens.",
      });
    }
    if (!spender.isContract) {
      findings.push({
        id: "spender-is-wallet",
        level: "danger",
        summary:
          "This gives a personal wallet, not an app, the right to move your tokens. Scammers use this to drain wallets.",
      });
    } else if (spender.verified === false) {
      findings.push({
        id: "unverified-spender",
        level: "caution",
        summary: "The app's contract code is not published, so nobody can check what it does.",
      });
    }
    if (
      spender.upgradeability &&
      spender.upgradeability.proxy !== "none" &&
      spender.upgradeability.controller.kind === "single-key"
    ) {
      findings.push({
        id: "upgradeable-single-key",
        level: "caution",
        summary:
          "One person's key can replace this app's code at any moment, with no delay. If that key is stolen or misused, the app can be turned against you.",
      });
    }
    if (spender.reputation === "unknown") {
      const unlimited = amounts.some((a) => a >= UNLIMITED_THRESHOLD);
      findings.push({
        id: "unknown-spender",
        level: "caution",
        summary:
          request.kind === "permit2-transfer"
            ? "An address we don't recognize could move these tokens out of your wallet as soon as you sign."
            : unlimited
              ? "An address we don't recognize could spend all of this token, now and in the future."
              : "An address we don't recognize could spend these tokens.",
      });
    }
  }

  if (
    request.kind === "permit2-allowance" &&
    request.permits.some((p) => p.amount > 0n && p.expiration - now > BigInt(LONG_EXPIRY_SECONDS))
  ) {
    findings.push({
      id: "permit2-long-expiry",
      level: "caution",
      summary: "This permission does not expire for more than a year.",
    });
  }
  return findings;
}

function seaportFindings(
  request: Extract<SignatureRequest, { kind: "seaport-order" }>,
  facts: ReadonlyMap<Address, SpenderInfo> | null,
  now: bigint,
): Finding[] {
  const findings: Finding[] = [];
  const contract = request.contract ? facts?.get(request.contract) : undefined;
  if (facts && contract?.reputation !== "known") {
    findings.push({
      id: "unknown-marketplace",
      level: "caution",
      summary: "This order is for a marketplace contract we don't recognize.",
    });
  }

  const nothingBack = request.orders.some(
    (o) =>
      o.offer.length > 0 &&
      !o.consideration.some((c) => c.recipient === o.offerer && c.endAmount > 0n),
  );
  if (nothingBack) {
    findings.push({
      id: "seaport-nothing-back",
      level: "danger",
      summary:
        "You would give items away and receive nothing in return. This is how fake listing scams steal NFTs.",
    });
  }

  if (
    request.orders.some((o) =>
      o.offer.some(
        (i) =>
          i.itemType === SEAPORT_ITEM.erc721Criteria || i.itemType === SEAPORT_ITEM.erc1155Criteria,
      ),
    )
  ) {
    findings.push({
      id: "seaport-any-item",
      level: "caution",
      summary: "This order covers any item from a collection, not one specific item you chose.",
    });
  }

  if (request.orders.some((o) => o.endTime - now > BigInt(LONG_LISTING_SECONDS))) {
    findings.push({
      id: "seaport-long-listing",
      level: "caution",
      summary: "This order stays open for more than a year unless you cancel it.",
    });
  }
  return findings;
}
