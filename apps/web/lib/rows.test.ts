import { PERMIT2, type RankedApproval } from "@plaintx/core";
import { describe, expect, it } from "vitest";
import { toRow } from "./rows";

const TOKEN = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";

const ranked = (approval: RankedApproval["approval"]): RankedApproval => ({
  approval,
  spender: {
    reputation: "known",
    isContract: true,
    verified: true,
    name: "Some App",
    status: "active",
  },
  verdict: { level: "no_known_risks", findings: [] },
});

describe("toRow", () => {
  it("makes a JSON-safe row with the revoke transaction ready", () => {
    const row = toRow(
      ranked({
        kind: "erc20",
        chainId: 1,
        token: TOKEN,
        spender: SPENDER,
        amount: 2n ** 256n - 1n,
      }),
    );
    expect(row).toMatchObject({
      kind: "erc20",
      asset: TOKEN,
      spenderName: "Some App",
      amount: "unlimited",
      revoke: { chainId: 1, to: TOKEN },
    });
    expect(row).not.toHaveProperty("rawAmount");
    expect(row).not.toHaveProperty("assetInfo");
    expect(() => JSON.stringify(row)).not.toThrow();
  });

  it("adds the asset's details and a limited amount", () => {
    const usdc = { name: "USD Coin", symbol: "USDC", decimals: 6 };
    const row = toRow(
      ranked({ kind: "erc20", chainId: 1, token: TOKEN, spender: SPENDER, amount: 5n }),
      new Map([[TOKEN, usdc]]),
    );
    expect(row).toMatchObject({ assetInfo: usdc, amount: "limited", rawAmount: "5" });
  });

  it("labels bounded, NFT and Permit2 approvals", () => {
    expect(
      toRow(ranked({ kind: "erc20", chainId: 1, token: TOKEN, spender: SPENDER, amount: 5n }))
        .amount,
    ).toBe("limited");
    expect(
      toRow(ranked({ kind: "nft-all", chainId: 1, collection: TOKEN, spender: SPENDER })).amount,
    ).toBe("all");
    const permit2 = toRow(
      ranked({
        kind: "permit2",
        chainId: 1,
        token: TOKEN,
        spender: SPENDER,
        amount: 5n,
        expiration: 1_900_000_000,
      }),
    );
    expect(permit2).toMatchObject({
      amount: "limited",
      expiration: 1_900_000_000,
      revoke: { to: PERMIT2 },
    });
  });
});
