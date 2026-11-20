/** Signature requests shaped like real ones, for tests. Not part of the build. */

export const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const OWNER = "0x1111111111111111111111111111111111111111";
export const SPENDER = "0x2222222222222222222222222222222222222222";

/** A USDC EIP-2612 permit, as a wallet receives it. */
export const usdcPermit = {
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "Permit",
  domain: { name: "USD Coin", version: "2", chainId: 1, verifyingContract: USDC.toLowerCase() },
  message: {
    owner: OWNER,
    spender: SPENDER,
    value: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    nonce: 0,
    deadline: "0x6553f100",
  },
};

export const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
export const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const SEAPORT_16 = "0x0000000000000068F116a894984e2DB1123eB395";
export const UNIVERSAL_ROUTER = "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af";
export const NFT = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D";
export const FEE_RECIPIENT = "0x0000a26b00c1F0DF003000390027140000fAa719";
export const MAX_UINT160 = "1461501637330902918203684832716283019655932542975";

const permit2Domain = { name: "Permit2", chainId: 1, verifyingContract: PERMIT2 };

/** DAI's own permit: `allowed` instead of an amount. */
export const daiPermit = {
  types: {
    EIP712Domain: usdcPermit.types.EIP712Domain,
    Permit: [
      { name: "holder", type: "address" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "allowed", type: "bool" },
    ],
  },
  primaryType: "Permit",
  domain: { name: "Dai Stablecoin", version: "1", chainId: 1, verifyingContract: DAI },
  message: { holder: OWNER, spender: SPENDER, nonce: 3, expiry: 0, allowed: true },
};

const permitDetails = [
  { name: "token", type: "address" },
  { name: "amount", type: "uint160" },
  { name: "expiration", type: "uint48" },
  { name: "nonce", type: "uint48" },
];

/** What Uniswap asks for before a swap: Permit2 allowance for the Universal Router. */
export const permit2Single = {
  types: {
    PermitSingle: [
      { name: "details", type: "PermitDetails" },
      { name: "spender", type: "address" },
      { name: "sigDeadline", type: "uint256" },
    ],
    PermitDetails: permitDetails,
  },
  primaryType: "PermitSingle",
  domain: permit2Domain,
  message: {
    details: { token: USDC, amount: MAX_UINT160, expiration: "1766000000", nonce: "0" },
    spender: UNIVERSAL_ROUTER,
    sigDeadline: "1763600000",
  },
};

/** The drainer favourite: every token at once, unlimited, to one address. */
export const permit2Batch = {
  types: {
    PermitBatch: [
      { name: "details", type: "PermitDetails[]" },
      { name: "spender", type: "address" },
      { name: "sigDeadline", type: "uint256" },
    ],
    PermitDetails: permitDetails,
  },
  primaryType: "PermitBatch",
  domain: permit2Domain,
  message: {
    details: [USDC, DAI, WETH].map((token) => ({
      token,
      amount: MAX_UINT160,
      expiration: "281474976710655",
      nonce: "0",
    })),
    spender: SPENDER,
    sigDeadline: "281474976710655",
  },
};

const tokenPermissions = [
  { name: "token", type: "address" },
  { name: "amount", type: "uint256" },
];

/** A UniswapX-style order: a one-time Permit2 transfer with the order attached as a witness. */
export const permit2Witness = {
  types: {
    PermitWitnessTransferFrom: [
      { name: "permitted", type: "TokenPermissions" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "witness", type: "LimitOrder" },
    ],
    TokenPermissions: tokenPermissions,
    LimitOrder: [
      { name: "swapper", type: "address" },
      { name: "outputToken", type: "address" },
      { name: "minOutput", type: "uint256" },
    ],
  },
  primaryType: "PermitWitnessTransferFrom",
  domain: permit2Domain,
  message: {
    permitted: { token: USDC, amount: "1000000000" },
    spender: SPENDER,
    nonce: "1",
    deadline: "1763600000",
    witness: { swapper: OWNER, outputToken: WETH, minOutput: "300000000000000000" },
  },
};

export const permit2BatchTransfer = {
  types: {
    PermitBatchTransferFrom: [
      { name: "permitted", type: "TokenPermissions[]" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    TokenPermissions: tokenPermissions,
  },
  primaryType: "PermitBatchTransferFrom",
  domain: permit2Domain,
  message: {
    permitted: [
      { token: USDC, amount: "5000000000" },
      { token: WETH, amount: "2000000000000000000" },
    ],
    spender: SPENDER,
    nonce: "7",
    deadline: "1763600000",
  },
};

const offerItem = [
  { name: "itemType", type: "uint8" },
  { name: "token", type: "address" },
  { name: "identifierOrCriteria", type: "uint256" },
  { name: "startAmount", type: "uint256" },
  { name: "endAmount", type: "uint256" },
];
const seaportTypes = {
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
  OfferItem: offerItem,
  ConsiderationItem: [...offerItem, { name: "recipient", type: "address" }],
};
const ZERO32 = `0x${"0".repeat(64)}`;
const ZERO = "0x0000000000000000000000000000000000000000";

function order(consideration: object[], offer?: object[]) {
  return {
    offerer: OWNER,
    zone: ZERO,
    offer: offer ?? [
      { itemType: 2, token: NFT, identifierOrCriteria: "1234", startAmount: "1", endAmount: "1" },
    ],
    consideration,
    orderType: 0,
    startTime: "1763000000",
    endTime: "1765600000",
    zoneHash: ZERO32,
    salt: "0x1",
    conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
    counter: "0",
  };
}

/** An honest OpenSea listing: the NFT for 9.75 ETH to the seller plus a 0.25 ETH fee. */
export const seaportListing = {
  types: seaportTypes,
  primaryType: "OrderComponents",
  domain: { name: "Seaport", version: "1.6", chainId: 1, verifyingContract: SEAPORT_16 },
  message: order([
    {
      itemType: 0,
      token: ZERO,
      identifierOrCriteria: "0",
      startAmount: "9750000000000000000",
      endAmount: "9750000000000000000",
      recipient: OWNER,
    },
    {
      itemType: 0,
      token: ZERO,
      identifierOrCriteria: "0",
      startAmount: "250000000000000000",
      endAmount: "250000000000000000",
      recipient: FEE_RECIPIENT,
    },
  ]),
};

/** The fake-listing scam: the NFT goes out, the only payment goes to someone else. */
export const seaportScam = {
  ...seaportListing,
  message: order(
    [
      {
        itemType: 0,
        token: ZERO,
        identifierOrCriteria: "0",
        startAmount: "1",
        endAmount: "1",
        recipient: SPENDER,
      },
    ],
    [{ itemType: 4, token: NFT, identifierOrCriteria: "0", startAmount: "1", endAmount: "1" }],
  ),
};

/** Two listings signed at once, padded to a tree of four as Seaport does. */
export const seaportBulk = {
  types: { BulkOrder: [{ name: "tree", type: "OrderComponents[2][2]" }], ...seaportTypes },
  primaryType: "BulkOrder",
  domain: seaportListing.domain,
  message: {
    tree: [
      [seaportListing.message, seaportScam.message],
      [order([], []), order([], [])],
    ],
  },
};

/** The EIP-712 specification's own example: nothing we recognize. */
export const mail = {
  types: {
    Person: [
      { name: "name", type: "string" },
      { name: "wallet", type: "address" },
    ],
    Mail: [
      { name: "from", type: "Person" },
      { name: "to", type: "Person" },
      { name: "contents", type: "string" },
    ],
  },
  primaryType: "Mail",
  domain: {
    name: "Ether Mail",
    version: "1",
    chainId: 1,
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
  },
  message: {
    from: { name: "Cow", wallet: OWNER },
    to: { name: "Bob", wallet: SPENDER },
    contents: "Hello, Bob!",
  },
};
