import { isIPv4, isIPv6 } from "node:net";

/**
 * The key a client is rate limited by: its IP address as seen by the first proxy we trust, or
 * "unknown" when there is none (they then share one limit).
 *
 * Each proxy in front of the app appends the address it received the request from to
 * X-Forwarded-For. Entries further left were written by the client and can be forged, so with
 * `trustedProxies` proxies we take that many entries in from the right.
 *
 * With none, Next.js fills the header with the connecting address only when it is missing, so a
 * client can choose its own key. That is fine locally; production must sit behind a proxy.
 *
 * IPv6 clients are limited per /64, the block one home or phone usually gets, since they can
 * switch between its addresses at will.
 */
export function clientKey(headers: Headers, trustedProxies: number): string {
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  const ip = hops[hops.length - Math.max(trustedProxies, 1)];
  return (ip && normalize(ip)) ?? "unknown";
}

function normalize(ip: string): string | undefined {
  if (isIPv4(ip)) return ip;
  if (!isIPv6(ip)) return undefined;
  const groups = expand(ip);
  // An IPv4 address on a dual-stack socket: ::ffff:1.2.3.4.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [hi = 0, lo = 0] = groups.slice(6);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}

/** The eight 16-bit groups of a valid IPv6 address. */
function expand(ip: string): number[] {
  let text = ip.replace(/%.*$/, "");
  // A trailing dotted IPv4 part fills the last two groups.
  const v4 = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", tail] = text.split("::");
  const parse = (part: string) => (part ? part.split(":").map((g) => Number.parseInt(g, 16)) : []);
  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);
  return [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
}
