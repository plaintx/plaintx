import { encodeFunctionData, type Hex, parseAbi } from "viem";
import type { Address, Approval } from "./approvals.js";

/** Uniswap Permit2, deployed at the same address on every supported chain. */
export const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
  "struct TokenSpenderPair { address token; address spender; }",
  "function lockdown(TokenSpenderPair[] approvals)",
]);

/**
 * An unsigned transaction that removes one approval. The owner's wallet sends it: PlainTx
 * never signs, and only the wallet that granted an approval can revoke it. See ADR 0007.
 */
export interface RevokeTransaction {
  chainId: number;
  to: Address;
  data: Hex;
}

/** Builds the transaction that sets this approval back to nothing. */
export function revokeTransaction(approval: Approval): RevokeTransaction {
  const { chainId } = approval;
  switch (approval.kind) {
    case "erc20":
      return {
        chainId,
        to: approval.token,
        data: encodeFunctionData({ abi, functionName: "approve", args: [approval.spender, 0n] }),
      };
    case "nft-all":
      return {
        chainId,
        to: approval.collection,
        data: encodeFunctionData({
          abi,
          functionName: "setApprovalForAll",
          args: [approval.spender, false],
        }),
      };
    case "permit2":
      // lockdown sets the allowance to zero and exists for exactly this purpose.
      return {
        chainId,
        to: PERMIT2,
        data: encodeFunctionData({
          abi,
          functionName: "lockdown",
          args: [[{ token: approval.token, spender: approval.spender }]],
        }),
      };
  }
}
