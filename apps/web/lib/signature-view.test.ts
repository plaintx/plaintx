import type { AssetInfo, SignatureReport } from "@plaintx/chain";
import {
  type Address,
  assessSignature,
  decodeSignature,
  PERMIT2,
  parseTypedData,
  partiesOf,
  type SpenderInfo,
} from "@plaintx/core";
import { describe, expect, it } from "vitest";
import { formatDate, type Line, toSignatureResult } from "./signature-view";

const NOW = 1_763_500_000;
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const SPENDER = "0x2222222222222222222222222222222222222222";
const OWNER = "0x1111111111111111111111111111111111111111";
const ROUTER = "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af";
const NFT = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D";
const ZERO = "0x0000000000000000000000000000000000000000";

const usdc: AssetInfo = { name: "USD Coin", symbol: "USDC", decimals: 6 };

function report(
  data: object,
  info: Record<string, SpenderInfo> = {},
  assets: Record<string, AssetInfo> = { [USDC]: usdc },
  checked = true,
): SignatureReport {
  const request = decodeSignature(parseTypedData(JSON.stringify(data)));
  const facts = new Map(Object.entries(info) as [Address, SpenderInfo][]);
  return {
    request,
    verdict: assessSignature(request, checked ? facts : null, NOW),
    parties: partiesOf(request).map((p) => {
      const i = facts.get(p.address);
      return i ? { ...p, info: i } : p;
    }),
    assets: new Map(Object.entries(assets) as [Address, AssetInfo][]),
  };
}

/** A line as plain text, with links shown as their label or address. */
const text = (line: Line) =>
  line.map((part) => (typeof part === "string" ? part : (part.label ?? part.address))).join("");

const permit = (value: string, chainId = 1) => ({
  types: {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "Permit",
  domain: { name: "USD Coin", version: "2", chainId, verifyingContract: USDC },
  message: { owner: OWNER, spender: SPENDER, value, nonce: 0, deadline: NOW + 3600 },
});

const permit2 = (amount: string, expiration: number) => ({
  types: {
    PermitSingle: [
      { name: "details", type: "PermitDetails" },
      { name: "spender", type: "address" },
      { name: "sigDeadline", type: "uint256" },
    ],
    PermitDetails: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
  primaryType: "PermitSingle",
  domain: { name: "Permit2", chainId: 1, verifyingContract: PERMIT2 },
  message: {
    details: { token: USDC, amount, expiration, nonce: 0 },
    spender: ROUTER,
    sigDeadline: "281474976710655",
  },
});

const known: SpenderInfo = {
  reputation: "known",
  isContract: true,
  verified: true,
  name: "Uniswap Universal Router 2.0",
};

describe("toSignatureResult", () => {
  it("explains an unlimited permit in plain words", () => {
    const result = toSignatureResult(report(permit((2n ** 256n - 1n).toString())), NOW);
    expect(result.title).toBe("Token permission (permit)");
    expect(result.chainLabel).toBe("Ethereum");
    expect(result.checked).toBe(true);
    expect(result.lines.map(text)).toEqual([
      `${SPENDER} could spend all of your USDC from your wallet.`,
      "The permission does not expire: it lasts until you remove it.",
    ]);
    expect(result.validity).toBe(
      `This signature can be used until ${formatDate(BigInt(NOW + 3600))}.`,
    );
  });

  it("shows limited amounts in token units, or raw units when decimals are unknown", () => {
    const result = toSignatureResult(report(permit("1500000000")), NOW);
    expect(text(result.lines[0] ?? [])).toContain("could spend up to 1,500 USDC");
    const raw = toSignatureResult(report(permit("1500000000"), {}, {}), NOW);
    expect(text(raw.lines[0] ?? [])).toContain("up to 1,500,000,000 units of this token");
  });

  it("names known apps and says how long a Permit2 allowance lasts", () => {
    const result = toSignatureResult(
      report(permit2("1000000", NOW + 86_400), {
        [ROUTER]: known,
        [PERMIT2]: { ...known, name: "Permit2" },
      }),
      NOW,
    );
    expect(result.lines.map(text)).toEqual([
      `Uniswap Universal Router 2.0 could spend up to 1 USDC through Permit2, until ${formatDate(BigInt(NOW + 86_400))}.`,
    ]);
    expect(result.validity).toBe("This signature can be used at any time: it never expires.");
    expect(result.parties).toEqual([
      {
        address: ROUTER,
        role: "Would get permission",
        name: "Uniswap Universal Router 2.0",
        isContract: true,
      },
      {
        address: PERMIT2,
        role: "Contract the signature is for",
        name: "Permit2",
        isContract: true,
      },
    ]);
  });

  it("says when a signature has expired", () => {
    const expired = permit("1");
    expired.message.deadline = NOW - 1;
    expect(toSignatureResult(report(expired), NOW).validity).toMatch(/has expired/);
  });

  it("describes what each side of a Seaport order gets", () => {
    const item = (itemType: number, token: string, id: string, amount: string) => ({
      itemType,
      token,
      identifierOrCriteria: id,
      startAmount: amount,
      endAmount: amount,
    });
    const offer = [
      { name: "itemType", type: "uint8" },
      { name: "token", type: "address" },
      { name: "identifierOrCriteria", type: "uint256" },
      { name: "startAmount", type: "uint256" },
      { name: "endAmount", type: "uint256" },
    ];
    const listing = {
      types: {
        OrderComponents: [
          { name: "offerer", type: "address" },
          { name: "zone", type: "address" },
          { name: "offer", type: "OfferItem[]" },
          { name: "consideration", type: "ConsiderationItem[]" },
          { name: "orderType", type: "uint8" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "zoneHash", type: "bytes32" },
          { name: "salt", type: "uint256" },
          { name: "conduitKey", type: "bytes32" },
          { name: "counter", type: "uint256" },
        ],
        OfferItem: offer,
        ConsiderationItem: [...offer, { name: "recipient", type: "address" }],
      },
      primaryType: "OrderComponents",
      domain: { name: "Seaport", version: "1.6", chainId: 1, verifyingContract: SPENDER },
      message: {
        offerer: OWNER,
        zone: ZERO,
        offer: [item(2, NFT, "1234", "1"), item(4, NFT, "0", "1")],
        consideration: [
          { ...item(0, ZERO, "0", "1500000000000000000"), recipient: OWNER },
          { ...item(1, USDC, "0", "2500000"), recipient: SPENDER },
        ],
        orderType: 0,
        startTime: NOW,
        endTime: NOW + 86_400,
        zoneHash: `0x${"0".repeat(64)}`,
        salt: 1,
        conduitKey: `0x${"0".repeat(64)}`,
        counter: 0,
      },
    };
    const result = toSignatureResult(
      report(listing, {}, { [USDC]: usdc, [NFT]: { name: "Bored Ape Yacht Club" } }),
      NOW,
    );
    expect(result.lines.map(text)).toEqual([
      "You give NFT #1234 from Bored Ape Yacht Club and any item from Bored Ape Yacht Club.",
      "You receive 1.5 ETH.",
      `2.5 USDC goes to ${SPENDER}.`,
    ]);
    expect(result.validity).toMatch(/^This order can be used until/);
  });

  it("explains requests it cannot read, and unchecked networks", () => {
    const result = toSignatureResult(
      report(
        {
          types: { Vote: [{ name: "choice", type: "uint8" }] },
          primaryType: "Vote",
          domain: { name: "Some DAO", chainId: 10 },
          message: { choice: 1 },
        },
        {},
        {},
        false,
      ),
      NOW,
    );
    expect(result.title).toBe("Unrecognized signature request");
    expect(result.chainLabel).toBe("chain 10");
    expect(result.checked).toBe(false);
    expect(result.lines.map(text)).toEqual([
      "This is a “Vote” request from an app calling itself “Some DAO”. We can't tell what signing it would let someone do.",
    ]);
    expect(result.validity).toBeUndefined();
  });

  it("is JSON-safe and never calls anything safe", () => {
    const result = toSignatureResult(report(permit("1")), NOW);
    const json = JSON.stringify(result);
    expect(JSON.parse(json)).toEqual(result);
    expect(json).not.toMatch(/\bsafe\b/i);
  });
});

describe("formatDate", () => {
  it("formats in UTC", () => {
    expect(formatDate(1_763_500_000n)).toBe("18 Nov 2025, 21:06 UTC");
  });
});
