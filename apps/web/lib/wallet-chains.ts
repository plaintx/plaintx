import { arbitrum, base, mainnet } from "viem/chains";

/**
 * Chains the browser wallet connects to, for revoking. Their public RPCs are the only hosts
 * outside our own origin the page may call (see lib/csp.ts).
 */
export const WALLET_CHAINS = [mainnet, base, arbitrum] as const;
