import type { AssetInfo, SignatureReport } from "@plaintx/chain";
import {
  type Address,
  type PartyRole,
  SEAPORT_ITEM,
  type SeaportItem,
  type SignatureRequest,
  UNLIMITED_THRESHOLD,
  type Verdict,
} from "@plaintx/core";
import { formatTokenAmount } from "./format";
import { CHAIN_OPTIONS } from "./types";

/** An address to show as a link, with the name we know it by. */
export interface AddressRef {
  address: string;
  label?: string;
}

/** A sentence made of text and address links, so the browser can render links safely. */
export type Line = (string | AddressRef)[];

export interface PartyView {
  address: string;
  role: string;
  name?: string;
  /** Undefined when the address could not be checked. */
  isContract?: boolean;
  listedBy?: string[];
}

/**
 * A checked signature request as the browser sees it: JSON-safe, in plain words. Built only
 * from the deterministic report; nothing here changes the verdict.
 */
export interface SignatureResult {
  title: string;
  chainId?: number;
  /** "Ethereum", or "chain 10" for a chain we don't support. */
  chainLabel?: string;
  /** False when the request's network could not be checked. */
  checked: boolean;
  /** What signing would let someone do. */
  lines: Line[];
  /** When the signature or order stops being usable. */
  validity?: string;
  verdict: Verdict;
  parties: PartyView[];
}

const ROLE_LABELS: Record<PartyRole, string> = {
  spender: "Would get permission",
  contract: "Contract the signature is for",
  recipient: "Receives part of the payment",
  zone: "Order zone",
  mentioned: "Mentioned in the request",
};

/** Timestamps from here on mean "never": 2^48-1 (Permit2's max) and type maxima are far past it. */
const FOREVER = 253_402_300_800n; // year 10000

export function toSignatureResult(report: SignatureReport, now: number): SignatureResult {
  const { request, verdict } = report;
  const chain = CHAIN_OPTIONS.find((c) => c.chainId === request.chainId);
  const names = new Map<string, string>();
  for (const p of report.parties) if (p.info?.name) names.set(p.address, p.info.name);
  const ref = (address: Address): AddressRef => {
    const label = names.get(address);
    return label ? { address, label } : { address };
  };
  // Every chain we support pays in ETH; others could be anything.
  const native = chain ? "ETH" : "of the network's own coin";
  const ctx: Context = { assets: report.assets, ref, now: BigInt(now), native };
  const checked = !verdict.findings.some((f) => f.id === "unchecked-network");

  const result: SignatureResult = {
    title: TITLES[request.kind],
    ...(request.chainId !== undefined
      ? { chainId: request.chainId, chainLabel: chain?.label ?? `chain ${request.chainId}` }
      : {}),
    checked,
    lines: describe(request, ctx),
    verdict,
    parties: report.parties.map((p) => ({
      address: p.address,
      role: ROLE_LABELS[p.role],
      ...(p.info?.name ? { name: p.info.name } : {}),
      ...(p.info ? { isContract: p.info.isContract } : {}),
      ...(p.info?.listedBy ? { listedBy: p.info.listedBy } : {}),
    })),
  };
  const validity = describeValidity(request, ctx.now);
  return validity ? { ...result, validity } : result;
}

const TITLES: Record<SignatureRequest["kind"], string> = {
  permit: "Token permission (permit)",
  "permit2-allowance": "Token permission (Permit2)",
  "permit2-transfer": "One-time token transfer (Permit2)",
  "seaport-order": "NFT marketplace order (Seaport)",
  unknown: "Unrecognized signature request",
};

interface Context {
  assets: ReadonlyMap<Address, AssetInfo>;
  ref: (address: Address) => AddressRef;
  now: bigint;
  native: string;
}

function describe(request: SignatureRequest, ctx: Context): Line[] {
  const { ref } = ctx;
  switch (request.kind) {
    case "permit":
      if (request.amount === 0n) {
        return [
          [
            "Removes the permission of ",
            ref(request.spender),
            " to spend your ",
            token(request.token, ctx),
            ".",
          ],
        ];
      }
      return [
        [
          ref(request.spender),
          ` could spend ${amountText(request.amount, request.token, ctx)} `,
          token(request.token, ctx),
          " from your wallet.",
        ],
        ["The permission does not expire: it lasts until you remove it."],
      ];
    case "permit2-allowance":
      return request.permits.map((p) =>
        p.amount === 0n
          ? [
              "Sets the permission of ",
              ref(request.spender),
              " for ",
              token(p.token, ctx),
              " to zero.",
            ]
          : [
              ref(request.spender),
              ` could spend ${amountText(p.amount, p.token, ctx)} `,
              token(p.token, ctx),
              ` through Permit2, ${until(p.expiration, ctx.now)}.`,
            ],
      );
    case "permit2-transfer":
      return [
        ...request.transfers.map(
          (t): Line => [
            ref(request.spender),
            ` could move ${amountText(t.amount, t.token, ctx)} `,
            token(t.token, ctx),
            " out of your wallet, once.",
          ],
        ),
        ...(request.witness
          ? [[`The app attached its own order details (${request.witness}) to this transfer.`]]
          : []),
      ];
    case "seaport-order":
      return request.orders.flatMap((order, i): Line[] => {
        const prefix = request.orders.length > 1 ? `Order ${i + 1}: you` : "You";
        const back = order.consideration.filter((c) => c.recipient === order.offerer);
        const others = order.consideration.filter((c) => c.recipient !== order.offerer);
        return [
          [`${prefix} give `, ...joined(order.offer.map((item) => itemParts(item, ctx))), "."],
          back.length > 0
            ? ["You receive ", ...joined(back.map((item) => itemParts(item, ctx))), "."]
            : ["You receive nothing in return."],
          ...others.map(
            (item): Line => [...itemParts(item, ctx), " goes to ", ref(item.recipient), "."],
          ),
        ];
      });
    case "unknown":
      return [
        [
          `This is a “${request.primaryType}” request`,
          ...(request.appName ? [` from an app calling itself “${request.appName}”`] : []),
          ". We can't tell what signing it would let someone do.",
        ],
      ];
  }
}

function token(address: Address, ctx: Context): AddressRef {
  const info = ctx.assets.get(address);
  const label = info?.symbol ?? info?.name;
  return label ? { address, label } : { address, label: "this token" };
}

function amountText(amount: bigint, address: Address, ctx: Context): string {
  if (amount >= UNLIMITED_THRESHOLD) return "all of your";
  const decimals = ctx.assets.get(address)?.decimals;
  return decimals === undefined
    ? `up to ${amount.toLocaleString("en-US")} units of`
    : `up to ${formatTokenAmount(amount.toString(), decimals)}`;
}

function itemParts(item: SeaportItem, ctx: Context): Line {
  const amount = (decimals: number) => {
    const fmt = (a: bigint) => formatTokenAmount(a.toString(), decimals);
    return item.startAmount === item.endAmount
      ? fmt(item.endAmount)
      : `${fmt(item.startAmount)} to ${fmt(item.endAmount)}`;
  };
  const collection = () => {
    const info = ctx.assets.get(item.token);
    const label = info?.name ?? info?.symbol;
    return label ? { address: item.token, label } : { address: item.token, label: "a collection" };
  };
  switch (item.itemType) {
    case SEAPORT_ITEM.native:
      return [`${amount(18)} ${ctx.native}`];
    case SEAPORT_ITEM.erc20: {
      const decimals = ctx.assets.get(item.token)?.decimals;
      return decimals === undefined
        ? [`${item.endAmount.toLocaleString("en-US")} units of `, token(item.token, ctx)]
        : [`${amount(decimals)} `, token(item.token, ctx)];
    }
    case SEAPORT_ITEM.erc721:
      return [`NFT #${item.identifierOrCriteria} from `, collection()];
    case SEAPORT_ITEM.erc1155:
      return [`${amount(0)} × item #${item.identifierOrCriteria} from `, collection()];
    case SEAPORT_ITEM.erc721Criteria:
    case SEAPORT_ITEM.erc1155Criteria:
      return ["any item from ", collection()];
    default:
      return ["an item of an unknown type"];
  }
}

/** "a", "a and b", "a, b and c" */
function joined(parts: Line[]): Line {
  if (parts.length === 0) return ["nothing"];
  return parts.flatMap((p, i) => [
    ...(i === 0 ? [] : [i === parts.length - 1 ? " and " : ", "]),
    ...p,
  ]);
}

function until(expiration: bigint, now: bigint): string {
  if (expiration >= FOREVER) return "with no end date";
  if (expiration <= now) return "but that permission has already expired";
  return `until ${formatDate(expiration)}`;
}

function describeValidity(request: SignatureRequest, now: bigint): string | undefined {
  const deadline =
    request.kind === "permit" ||
    request.kind === "permit2-allowance" ||
    request.kind === "permit2-transfer"
      ? request.deadline
      : request.kind === "seaport-order"
        ? // biome-ignore lint/complexity/useMathMinMax: Math.max does not take bigints.
          request.orders.reduce((max, o) => (o.endTime > max ? o.endTime : max), 0n)
        : undefined;
  if (deadline === undefined) return undefined;
  const what = request.kind === "seaport-order" ? "This order" : "This signature";
  if (deadline <= now) return `${what} has expired and can no longer be used.`;
  if (deadline >= FOREVER) return `${what} can be used at any time: it never expires.`;
  return `${what} can be used until ${formatDate(deadline)}.`;
}

/** "19 Nov 2026, 22:13 UTC": UTC, so server and browser always agree. */
export function formatDate(unixSeconds: bigint): string {
  const text = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Number(unixSeconds) * 1000));
  return `${text} UTC`;
}
