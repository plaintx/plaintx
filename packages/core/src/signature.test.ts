import { describe, expect, it } from "vitest";
import type { Address, SpenderInfo } from "./approvals.js";
import {
  DAI,
  daiPermit,
  mail,
  NFT,
  OWNER,
  PERMIT2,
  permit2Batch,
  permit2BatchTransfer,
  permit2Single,
  permit2Witness,
  SEAPORT_16,
  SPENDER,
  seaportBulk,
  seaportListing,
  seaportScam,
  UNIVERSAL_ROUTER,
  USDC,
  usdcPermit,
  WETH,
} from "./fixtures/typed-data.js";
import {
  assessSignature,
  assetsOf,
  decodeSignature,
  MAX_UNKNOWN_ADDRESSES,
  partiesOf,
  type SignatureRequest,
} from "./signature.js";
import { parseTypedData } from "./typed-data.js";

const NOW = 1_763_500_000;
const decode = (data: object) => decodeSignature(parseTypedData(JSON.stringify(data)));

const known: SpenderInfo = { reputation: "known", isContract: true, verified: true };
const unknownContract: SpenderInfo = { reputation: "unknown", isContract: true, verified: true };
const wallet: SpenderInfo = { reputation: "unknown", isContract: false, verified: false };
const scam: SpenderInfo = {
  reputation: "malicious",
  isContract: false,
  verified: false,
  listedBy: ["Test list"],
};

function facts(entries: Record<string, SpenderInfo>): Map<Address, SpenderInfo> {
  return new Map(Object.entries(entries) as [Address, SpenderInfo][]);
}

/** Every party looked up and found to be an unknown, verified contract. */
const allUnknown = (request: SignatureRequest, overrides: Record<string, SpenderInfo> = {}) =>
  facts({
    ...Object.fromEntries(partiesOf(request).map((p) => [p.address, unknownContract])),
    ...overrides,
  });

const ids = (request: SignatureRequest, f: Map<Address, SpenderInfo> | null) =>
  assessSignature(request, f, NOW).findings.map((x) => x.id);

describe("decodeSignature", () => {
  it("decodes an EIP-2612 permit", () => {
    expect(decode(usdcPermit)).toEqual({
      kind: "permit",
      standard: "eip2612",
      chainId: 1,
      token: USDC,
      spender: SPENDER,
      amount: 2n ** 256n - 1n,
      deadline: 0x6553f100n,
    });
  });

  it("decodes DAI's permit, where allowed means unlimited and expiry 0 means never", () => {
    expect(decode(daiPermit)).toMatchObject({
      kind: "permit",
      standard: "dai",
      token: DAI,
      amount: 2n ** 256n - 1n,
      deadline: 2n ** 256n - 1n,
    });
    const revoke = decode({ ...daiPermit, message: { ...daiPermit.message, allowed: false } });
    expect(revoke).toMatchObject({ amount: 0n });
  });

  it("decodes Permit2 single and batch allowances", () => {
    expect(decode(permit2Single)).toEqual({
      kind: "permit2-allowance",
      chainId: 1,
      contract: PERMIT2,
      spender: UNIVERSAL_ROUTER,
      permits: [{ token: USDC, amount: 2n ** 160n - 1n, expiration: 1_766_000_000n }],
      deadline: 1_763_600_000n,
    });
    const batch = decode(permit2Batch);
    expect(batch.kind === "permit2-allowance" && batch.permits.map((p) => p.token)).toEqual([
      USDC,
      DAI,
      WETH,
    ]);
  });

  it("decodes Permit2 transfers, with and without a witness", () => {
    expect(decode(permit2Witness)).toEqual({
      kind: "permit2-transfer",
      chainId: 1,
      contract: PERMIT2,
      spender: SPENDER,
      transfers: [{ token: USDC, amount: 1_000_000_000n }],
      deadline: 1_763_600_000n,
      witness: "LimitOrder",
    });
    expect(decode(permit2BatchTransfer)).toMatchObject({
      kind: "permit2-transfer",
      transfers: [
        { token: USDC, amount: 5_000_000_000n },
        { token: WETH, amount: 2_000_000_000_000_000_000n },
      ],
    });
    expect(decode(permit2BatchTransfer)).not.toHaveProperty("witness");
  });

  it("decodes a Seaport listing", () => {
    const request = decode(seaportListing);
    expect(request.kind).toBe("seaport-order");
    if (request.kind !== "seaport-order") return;
    expect(request.contract).toBe(SEAPORT_16);
    expect(request.orders).toHaveLength(1);
    expect(request.orders[0]).toMatchObject({
      offerer: OWNER,
      offer: [{ itemType: 2, token: NFT, identifierOrCriteria: 1234n }],
      consideration: [
        { itemType: 0, endAmount: 9_750_000_000_000_000_000n, recipient: OWNER },
        { itemType: 0, endAmount: 250_000_000_000_000_000n },
      ],
    });
  });

  it("decodes a Seaport bulk order and drops the empty padding orders", () => {
    const request = decode(seaportBulk);
    expect(request.kind === "seaport-order" && request.orders).toHaveLength(2);
  });

  it("leaves anything else unknown, listing the addresses in it", () => {
    expect(decode(mail)).toEqual({
      kind: "unknown",
      chainId: 1,
      contract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
      primaryType: "Mail",
      appName: "Ether Mail",
      addresses: [OWNER, SPENDER],
    });
  });

  it("leaves out the signer and caps how many addresses an unknown request lists", () => {
    const many = Array.from(
      { length: 15 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`,
    );
    const data = {
      types: { List: [{ name: "who", type: "address[]" }] },
      primaryType: "List",
      domain: {},
      message: { who: [OWNER, ...many] },
    };
    const request = decodeSignature(parseTypedData(JSON.stringify([OWNER, data])));
    expect(request.kind === "unknown" && request.addresses).toHaveLength(MAX_UNKNOWN_ADDRESSES);
    expect(request.kind === "unknown" && request.addresses).not.toContain(OWNER);
  });

  it("does not take a renamed or reshaped struct for a known one", () => {
    const renamed = {
      ...permit2Single,
      types: { ...permit2Single.types, PermitDetails: permit2Single.types.PermitDetails.slice(1) },
    };
    expect(() => decode(renamed)).not.toThrow();
    expect(decode(renamed).kind).toBe("unknown");
    const noContract = { ...usdcPermit, domain: { name: "USD Coin", chainId: 1 } };
    expect(decode(noContract).kind).toBe("unknown");
  });
});

describe("partiesOf and assetsOf", () => {
  it("lists who gets power over the assets, without the signer", () => {
    expect(partiesOf(decode(permit2Single))).toEqual([
      { address: UNIVERSAL_ROUTER, role: "spender" },
      { address: PERMIT2, role: "contract" },
    ]);
    const parties = partiesOf(decode(seaportListing));
    expect(parties.map((p) => p.role)).toEqual(["contract", "recipient"]);
    expect(parties.map((p) => p.address)).not.toContain(OWNER);
  });

  it("lists the tokens involved, but not native ETH", () => {
    expect(assetsOf(decode(permit2Batch))).toEqual([USDC, DAI, WETH]);
    expect(assetsOf(decode(seaportListing))).toEqual([NFT]);
  });
});

describe("assessSignature", () => {
  it("finds no known risks in a Uniswap Permit2 request for a known router", () => {
    const verdict = assessSignature(
      decode(permit2Single),
      facts({ [UNIVERSAL_ROUTER]: known, [PERMIT2]: known }),
      NOW,
    );
    expect(verdict).toEqual({ level: "no_known_risks", findings: [] });
  });

  it("is dangerous when the spender is on a scam list or is a plain wallet", () => {
    const request = decode(usdcPermit);
    expect(ids(request, facts({ [SPENDER]: scam }))).toContain("malicious-spender");
    expect(assessSignature(request, facts({ [SPENDER]: wallet }), NOW).level).toBe("danger");
    expect(ids(request, facts({ [SPENDER]: wallet }))).toEqual([
      "spender-is-wallet",
      "unknown-spender",
    ]);
  });

  it("cautions about unknown spenders, saying when the amount is unlimited", () => {
    const verdict = assessSignature(decode(usdcPermit), facts({ [SPENDER]: unknownContract }), NOW);
    expect(verdict.level).toBe("caution");
    expect(verdict.findings[0]?.summary).toMatch(/all of this token/);
    const transfer = assessSignature(
      decode(permit2Witness),
      facts({ [SPENDER]: unknownContract, [PERMIT2]: known }),
      NOW,
    );
    expect(transfer.findings.map((f) => f.summary).join()).toMatch(/as soon as you sign/);
  });

  it("flags Permit2 allowances that last over a year, and fake Permit2 contracts", () => {
    const request = decode(permit2Batch);
    const f = facts({ [SPENDER]: known, [PERMIT2]: known });
    expect(ids(request, f)).toEqual(["permit2-long-expiry"]);
    const fake = decode({
      ...permit2Single,
      domain: { ...permit2Single.domain, verifyingContract: SPENDER },
    });
    expect(ids(fake, facts({ [UNIVERSAL_ROUTER]: known, [SPENDER]: unknownContract }))).toEqual([
      "unofficial-permit2",
    ]);
  });

  it("raises nothing for a permit that only removes a permission", () => {
    const revoke = decode({ ...daiPermit, message: { ...daiPermit.message, allowed: false } });
    expect(ids(revoke, facts({ [SPENDER]: wallet }))).toEqual([]);
  });

  it("passes on the other spender rules: compromised, unverified, single-key upgrades", () => {
    const risky: SpenderInfo = {
      reputation: "known",
      isContract: true,
      verified: false,
      status: "compromised",
      upgradeability: {
        proxy: "eip1967",
        controller: { kind: "single-key", address: OWNER },
      },
    };
    expect(ids(decode(usdcPermit), facts({ [SPENDER]: risky }))).toEqual([
      "compromised-spender",
      "unverified-spender",
      "upgradeable-single-key",
    ]);
  });

  it("finds no known risks in an honest Seaport listing", () => {
    const f = facts({ [SEAPORT_16]: known, "0x0000a26b00c1F0DF003000390027140000fAa719": known });
    expect(ids(decode(seaportListing), f)).toEqual([]);
  });

  it("is dangerous when a listing gives items away for nothing", () => {
    const f = facts({ [SEAPORT_16]: known, [SPENDER]: unknownContract });
    const verdict = assessSignature(decode(seaportScam), f, NOW);
    expect(verdict.level).toBe("danger");
    expect(verdict.findings.map((x) => x.id)).toEqual(["seaport-nothing-back", "seaport-any-item"]);
    // One bad order in a bulk listing is enough.
    expect(ids(decode(seaportBulk), f)).toContain("seaport-nothing-back");
  });

  it("cautions about unknown marketplaces and listings open over a year", () => {
    const longListing = {
      ...seaportListing,
      message: { ...seaportListing.message, endTime: String(NOW + 400 * 86_400) },
    };
    expect(ids(decode(longListing), allUnknown(decode(longListing)))).toEqual([
      "unknown-marketplace",
      "seaport-long-listing",
    ]);
  });

  it("cautions about any request it does not recognize, and still checks its addresses", () => {
    expect(ids(decode(mail), allUnknown(decode(mail)))).toEqual(["unrecognized-signature"]);
    expect(ids(decode(mail), allUnknown(decode(mail), { [SPENDER]: scam }))).toEqual([
      "malicious-mentioned",
      "unrecognized-signature",
    ]);
  });

  it("says when the network could not be checked or a scam list did not answer", () => {
    expect(ids(decode(permit2Single), null)).toEqual(["unchecked-network"]);
    const down: SpenderInfo = { ...known, blocklistUnavailable: true };
    expect(
      ids(decode(permit2Single), facts({ [UNIVERSAL_ROUTER]: down, [PERMIT2]: known })),
    ).toEqual(["blocklist-unavailable"]);
  });

  it("says when some parties went unchecked", () => {
    const request = decode(permit2Single);
    expect(ids(request, facts({ [UNIVERSAL_ROUTER]: known }))).toEqual(["unchecked-addresses"]);
  });

  it("never gives a verdict called safe", () => {
    const all = [usdcPermit, daiPermit, permit2Single, permit2Batch, seaportListing, mail].map(
      (d) => assessSignature(decode(d), allUnknown(decode(d)), NOW),
    );
    for (const verdict of all) {
      expect(JSON.stringify(verdict)).not.toMatch(/\bsafe\b/i);
    }
  });
});
