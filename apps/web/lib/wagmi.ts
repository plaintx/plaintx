import { createConfig, http } from "wagmi";
import { arbitrum, base, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * Browser wallets only (MetaMask, Rabby, ...). The wallet signs and sends; these public RPCs
 * are only used to watch for the transaction receipt, so no API key reaches the browser.
 */
export const wagmiConfig = createConfig({
  chains: [mainnet, base, arbitrum],
  connectors: [injected()],
  transports: { [mainnet.id]: http(), [base.id]: http(), [arbitrum.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
