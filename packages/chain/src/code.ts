/** EIP-7702: a wallet that delegates to code carries this prefix but is still a personal wallet. */
const DELEGATION_PREFIX = "0xef0100";

/** True for deployed contract code; false for no code or an EIP-7702 delegated wallet. */
export function isContractCode(code: `0x${string}` | undefined): boolean {
  return !!code && code !== "0x" && !code.startsWith(DELEGATION_PREFIX);
}
