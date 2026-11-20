/**
 * Sample signature requests for the "Try an example" buttons, shaped like real ones. Times are
 * relative to when the button is pressed, so the examples never expire.
 */

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
// Uniswap Universal Router 2.0 on Ethereum.
const UNIVERSAL_ROUTER = "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af";
const SEAPORT_16 = "0x0000000000000068F116a894984e2DB1123eB395";
const BAYC = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D";
/** Stand-ins: an example wallet, and an address playing the scammer. Neither is a real person's. */
const EXAMPLE_WALLET = "0x1111111111111111111111111111111111111111";
const EXAMPLE_SCAMMER = "0x5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e";
const ZERO = "0x0000000000000000000000000000000000000000";
const ZERO32 = `0x${"0".repeat(64)}`;

export interface SignatureExample {
  label: string;
  build: (nowSeconds: number) => object;
}

const offerItem = [
  { name: "itemType", type: "uint8" },
  { name: "token", type: "address" },
  { name: "identifierOrCriteria", type: "uint256" },
  { name: "startAmount", type: "uint256" },
  { name: "endAmount", type: "uint256" },
];

export const SIGNATURE_EXAMPLES: SignatureExample[] = [
  {
    label: "Uniswap swap",
    build: (now) => ({
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
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
      domain: { name: "Permit2", chainId: "1", verifyingContract: PERMIT2 },
      message: {
        details: {
          token: USDC,
          amount: "100000000",
          expiration: String(now + 30 * 86_400),
          nonce: "0",
        },
        spender: UNIVERSAL_ROUTER,
        sigDeadline: String(now + 30 * 60),
      },
    }),
  },
  {
    label: "Fake NFT listing (scam)",
    build: (now) => ({
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
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
      },
      primaryType: "OrderComponents",
      domain: { name: "Seaport", version: "1.6", chainId: "1", verifyingContract: SEAPORT_16 },
      message: {
        offerer: EXAMPLE_WALLET,
        zone: ZERO,
        offer: [
          {
            itemType: "2",
            token: BAYC,
            identifierOrCriteria: "1234",
            startAmount: "1",
            endAmount: "1",
          },
        ],
        consideration: [
          {
            itemType: "0",
            token: ZERO,
            identifierOrCriteria: "0",
            startAmount: "1",
            endAmount: "1",
            recipient: EXAMPLE_SCAMMER,
          },
        ],
        orderType: "0",
        startTime: String(now),
        endTime: String(now + 2 * 365 * 86_400),
        zoneHash: ZERO32,
        salt: "24446860302761739304752683030156737591518664810215442929818227897836383814680",
        conduitKey: ZERO32,
        counter: "0",
      },
    }),
  },
];
