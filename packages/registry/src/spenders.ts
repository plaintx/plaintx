import type { KnownSpender } from "./registry.js";

/**
 * Curated list of app contracts that hold token permissions. Every entry was checked against
 * the protocol's own repositories at the pinned commits below; `pnpm registry:verify` re-checks
 * the on-chain facts and that each source still contains the address.
 * Rules for adding or changing entries: docs/decisions/0005-spender-registry.md.
 */

const gh = (repo: string, commit: string) => (path: string) =>
  `https://github.com/${repo}/blob/${commit}/${path}`;

const uniswapDocs = gh("Uniswap/docs", "1c7597d73be0e9a3a4e44aa75b8fb212b40ea136");
const uniswapSdks = gh("Uniswap/sdks", "17d70b1b1068fc1b5ce79a89fb5901e562a22e79");
const universalRouter = gh("Uniswap/universal-router", "543e1a19d6e21e31ced2512eec5792b50f13a0ba");
const v3Periphery = gh("Uniswap/v3-periphery", "0682387198a24c7cd63566a2c58398533860a5d1");
const cowContracts = gh("cowprotocol/contracts", "c07a93e3596194c5e3cf331c755a3f9f0e4a17d8");
const cowDocs = gh("cowprotocol/docs", "c2fb568571da33109a42a3965b02c0715da3dfc6");
const zeroExDocs = gh("0xProject/0x-docs", "de94d4fa23bea32b631df4a862990cfc4fec4d92");
const zeroExSettler = gh("0xProject/0x-settler", "1b8025f928da33bf4bd352a10c483bb3de6167b2");
const zeroExProtocol = gh("0xProject/protocol", "2c8e51e36ccbafa39f7c9003f4087710665acb02");
const seaport = gh("ProjectOpenSea/seaport", "7f966fe7bd75932beb0366f6485aa720512b1259");
const seaportJs = gh("ProjectOpenSea/seaport-js", "69ad00bdb234e4011359fc1507fe2c564d90e2a3");
const openseaJs = gh("ProjectOpenSea/opensea-js", "0b509d1af6430a4d5540484199d241dea1c11464");

const UNISWAP_V2_DOCS = uniswapDocs("content/protocols/v2/deployments.mdx");
const UNISWAP_V3_DOCS = {
  1: uniswapDocs("content/protocols/v3/deployments/v3-ethereum-deployments.mdx"),
  8453: uniswapDocs("content/protocols/v3/deployments/v3-base-deployments.mdx"),
  42161: uniswapDocs("content/protocols/v3/deployments/v3-arbitrum-deployments.mdx"),
};
const UNISWAP_V4_DOCS = uniswapDocs("content/protocols/v4/deployments.mdx");
const SDK_CORE_ADDRESSES = uniswapSdks("sdks/sdk-core/src/addresses.ts");
const UR_SDK_CONSTANTS = uniswapSdks("sdks/universal-router-sdk/src/utils/constants.ts");
const UR_DEPLOYS = {
  1: universalRouter("deploy-addresses/mainnet.json"),
  8453: universalRouter("deploy-addresses/base.json"),
  42161: universalRouter("deploy-addresses/arbitrum.json"),
};

const REVIEWED = "2026-10-11";

export const KNOWN_SPENDERS: readonly KnownSpender[] = [
  // Uniswap: Permit2 holds token approvals on behalf of Uniswap's routers and many other apps.
  {
    chains: [1, 8453, 42161],
    address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    name: "Permit2",
    protocol: "Uniswap",
    kind: "allowance-manager",
    status: "active",
    sources: [UNISWAP_V4_DOCS, uniswapSdks("sdks/permit2-sdk/src/constants.ts")],
    reviewedAt: REVIEWED,
  },
  {
    chains: [1],
    address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    name: "Uniswap V2 Router 02",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UNISWAP_V2_DOCS, SDK_CORE_ADDRESSES],
    reviewedAt: REVIEWED,
  },
  {
    chains: [8453, 42161],
    address: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    name: "Uniswap V2 Router 02",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UNISWAP_V2_DOCS, SDK_CORE_ADDRESSES],
    reviewedAt: REVIEWED,
  },
  {
    chains: [1, 42161],
    address: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    name: "Uniswap V3 SwapRouter",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UNISWAP_V3_DOCS[1], UNISWAP_V3_DOCS[42161], v3Periphery("deploys.md")],
    reviewedAt: REVIEWED,
  },
  {
    chains: [1, 42161],
    address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    name: "Uniswap SwapRouter02",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UNISWAP_V3_DOCS[1], UNISWAP_V3_DOCS[42161], SDK_CORE_ADDRESSES],
    reviewedAt: REVIEWED,
  },
  {
    chains: [8453],
    address: "0x2626664c2603336E57B271c5C0b26F421741e481",
    name: "Uniswap SwapRouter02",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UNISWAP_V3_DOCS[8453], SDK_CORE_ADDRESSES],
    reviewedAt: REVIEWED,
  },

  // Uniswap Universal Router: the spender on most Permit2 allowances. One address per version and chain.
  {
    chains: [1, 8453],
    address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
    name: "Uniswap Universal Router 1.2",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UR_DEPLOYS[1], UR_DEPLOYS[8453], UR_SDK_CONSTANTS],
    reviewedAt: REVIEWED,
  },
  {
    chains: [42161],
    address: "0x5E325eDA8064b456f4781070C0738d849c824258",
    name: "Uniswap Universal Router 1.2",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UR_DEPLOYS[42161], UR_SDK_CONSTANTS],
    reviewedAt: REVIEWED,
  },
  {
    chains: [1],
    address: "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af",
    name: "Uniswap Universal Router 2.0",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UNISWAP_V4_DOCS, UR_DEPLOYS[1], UR_SDK_CONSTANTS],
    reviewedAt: REVIEWED,
  },
  {
    chains: [8453],
    address: "0x6fF5693b99212Da76ad316178A184AB56D299b43",
    name: "Uniswap Universal Router 2.0",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UNISWAP_V4_DOCS, UR_DEPLOYS[8453], UR_SDK_CONSTANTS],
    reviewedAt: REVIEWED,
  },
  {
    chains: [42161],
    address: "0xA51afAFe0263b40EdaEf0Df8781eA9aa03E381a3",
    name: "Uniswap Universal Router 2.0",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UNISWAP_V4_DOCS, UR_DEPLOYS[42161], UR_SDK_CONSTANTS],
    reviewedAt: REVIEWED,
  },
  {
    chains: [1],
    address: "0x4C82D1fBFe28C977cBB58D8C7FF8FCF9F70a2cCA",
    name: "Uniswap Universal Router 2.1.1",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UNISWAP_V4_DOCS, UR_DEPLOYS[1], UR_SDK_CONSTANTS],
    reviewedAt: REVIEWED,
  },
  {
    chains: [8453],
    address: "0xFdf682F51FE81Aa4898F0AE2163d8A55c127fbC7",
    name: "Uniswap Universal Router 2.1.1",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UNISWAP_V4_DOCS, UR_DEPLOYS[8453], UR_SDK_CONSTANTS],
    reviewedAt: REVIEWED,
  },
  {
    chains: [42161],
    address: "0x8B844f885672f333Bc0042cB669255f93a4C1E6b",
    name: "Uniswap Universal Router 2.1.1",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UNISWAP_V4_DOCS, UR_DEPLOYS[42161], UR_SDK_CONSTANTS],
    reviewedAt: REVIEWED,
  },
  {
    chains: [1],
    address: "0x23617e59A5925b2A4Bf75d73ff6711cD0b29De85",
    name: "Uniswap Universal Router 2.1.2",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UR_DEPLOYS[1], UR_SDK_CONSTANTS],
    reviewedAt: REVIEWED,
  },
  {
    chains: [8453],
    address: "0xd6145b2D3F379919E8CdEda7B97e37c4b2Ca9c40",
    name: "Uniswap Universal Router 2.1.2",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UR_DEPLOYS[8453], UR_SDK_CONSTANTS],
    reviewedAt: REVIEWED,
  },
  {
    chains: [42161],
    address: "0x2d01411773c8C24805306E89A41F7855C3c4Fe65",
    name: "Uniswap Universal Router 2.1.2",
    protocol: "Uniswap",
    kind: "dex-router",
    status: "active",
    sources: [UR_DEPLOYS[42161], UR_SDK_CONSTANTS],
    reviewedAt: REVIEWED,
  },

  // CoW Protocol: users approve the vault relayer; only the settlement contract can pull through it.
  {
    chains: [1, 8453, 42161],
    address: "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110",
    name: "CoW Protocol Vault Relayer",
    protocol: "CoW Protocol",
    kind: "settlement-relayer",
    status: "active",
    sources: [
      cowContracts("networks.json"),
      cowDocs("docs/cow-protocol/reference/contracts/core/README.mdx"),
    ],
    reviewedAt: REVIEWED,
  },

  // 0x
  {
    chains: [1, 8453, 42161],
    address: "0x0000000000001fF3684f28c67538d4D072C22734",
    name: "0x AllowanceHolder",
    protocol: "0x",
    kind: "allowance-manager",
    status: "active",
    sources: [
      zeroExDocs("fern/docs/pages/core-concepts/contracts.mdx"),
      zeroExSettler("README.md"),
    ],
    reviewedAt: REVIEWED,
  },
  {
    // Also deployed on Arbitrum, but its source is not verified there (checked 2026-10-11).
    chains: [1, 8453],
    address: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
    name: "0x Exchange Proxy",
    protocol: "0x",
    kind: "dex-router",
    status: "deprecated",
    statusNote: `0x API v1, which routed swaps through this contract, was sunset on 2025-04-11: ${zeroExDocs("fern/docs/pages/upgrading/upgrading-to-swap-v2.mdx")}`,
    sources: [
      zeroExProtocol("packages/contract-addresses/addresses.json"),
      zeroExProtocol("docs/basics/addresses.rst"),
      zeroExDocs("fern/docs/pages/upgrading/upgrading-to-swap-v2.mdx"),
    ],
    reviewedAt: REVIEWED,
  },

  // OpenSea: Seaport settles trades; the OpenSea conduit is what NFT approvals are usually given to.
  {
    chains: [1, 8453, 42161],
    address: "0x1E0049783F008A0085193E00003D00cd54003c71",
    name: "OpenSea Conduit",
    protocol: "OpenSea",
    kind: "nft-conduit",
    status: "active",
    sources: [seaportJs("src/constants.ts"), openseaJs("src/constants.ts")],
    reviewedAt: REVIEWED,
  },
  {
    chains: [1, 8453, 42161],
    address: "0x0000000000000068F116a894984e2DB1123eB395",
    name: "Seaport 1.6",
    protocol: "OpenSea",
    kind: "nft-marketplace",
    status: "active",
    sources: [seaport("README.md"), seaportJs("src/constants.ts")],
    reviewedAt: REVIEWED,
  },
  {
    chains: [1, 8453, 42161],
    address: "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC",
    name: "Seaport 1.5",
    protocol: "OpenSea",
    kind: "nft-marketplace",
    status: "active",
    sources: [seaport("README.md"), seaportJs("src/constants.ts")],
    reviewedAt: REVIEWED,
  },
];
