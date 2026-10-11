import { decodeFunctionData, parseAbi, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import type { Approval } from "./approvals.js";
import { PERMIT2, revokeTransaction } from "./revoke.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";

const abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
  "struct TokenSpenderPair { address token; address spender; }",
  "function lockdown(TokenSpenderPair[] approvals)",
]);

describe("revokeTransaction", () => {
  it("sets an ERC-20 allowance to zero on the token", () => {
    const approval: Approval = {
      kind: "erc20",
      chainId: 8453,
      token: TOKEN,
      spender: SPENDER,
      amount: 5n,
    };
    const tx = revokeTransaction(approval);
    expect(tx.chainId).toBe(8453);
    expect(tx.to).toBe(TOKEN);
    expect(tx.data.slice(0, 10)).toBe(toFunctionSelector("approve(address,uint256)"));
    expect(decodeFunctionData({ abi, data: tx.data }).args).toEqual([SPENDER, 0n]);
  });

  it("turns off an NFT collection approval", () => {
    const approval: Approval = { kind: "nft-all", chainId: 1, collection: TOKEN, spender: SPENDER };
    const tx = revokeTransaction(approval);
    expect(tx.to).toBe(TOKEN);
    expect(tx.data.slice(0, 10)).toBe(toFunctionSelector("setApprovalForAll(address,bool)"));
    expect(decodeFunctionData({ abi, data: tx.data }).args).toEqual([SPENDER, false]);
  });

  it("locks down a Permit2 allowance on the Permit2 contract", () => {
    const approval: Approval = {
      kind: "permit2",
      chainId: 42161,
      token: TOKEN,
      spender: SPENDER,
      amount: 5n,
      expiration: 1_900_000_000,
    };
    const tx = revokeTransaction(approval);
    expect(tx.to).toBe(PERMIT2);
    expect(tx.data.slice(0, 10)).toBe(toFunctionSelector("lockdown((address,address)[])"));
    expect(decodeFunctionData({ abi, data: tx.data }).args).toEqual([
      [{ token: TOKEN, spender: SPENDER }],
    ]);
  });
});
