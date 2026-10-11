import type { Address, Upgradeability, UpgradeController } from "@plaintx/core";
import {
  BaseError,
  type Hex,
  HttpRequestError,
  LimitExceededRpcError,
  parseAbi,
  TimeoutError,
} from "viem";
import { isContractCode } from "./code.js";
import type { ChainReader } from "./state.js";

/** Storage slots where standard proxies keep their implementation and admin. See ADR 0006. */
export const SLOTS = {
  /** EIP-1967: keccak256("eip1967.proxy.implementation") - 1 */
  implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  /** EIP-1967: keccak256("eip1967.proxy.admin") - 1 */
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  /** EIP-1967: keccak256("eip1967.proxy.beacon") - 1 */
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
  /** EIP-1822 (UUPS): keccak256("PROXIABLE") */
  proxiable: "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7",
  /** OpenZeppelin before EIP-1967 (e.g. USDC): keccak256("org.zeppelinos.proxy.implementation") */
  legacyImplementation: "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3",
  /** keccak256("org.zeppelinos.proxy.admin") */
  legacyAdmin: "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b",
} as const satisfies Record<string, Hex>;

const abi = parseAbi([
  "function implementation() view returns (address)",
  "function owner() view returns (address)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function getMinDelay() view returns (uint256)",
  "function delay() view returns (uint256)",
]);

/** How many owner() hops to follow, e.g. proxy -> ProxyAdmin -> Safe. */
const MAX_DEPTH = 2;

/** Detects a standard proxy and works out who can upgrade it. */
export async function readUpgradeability(
  client: ChainReader,
  address: Address,
): Promise<Upgradeability> {
  const slot = (s: Hex) => readAddressSlot(client, address, s);
  const [implementation, beacon, legacy, proxiable] = await Promise.all([
    slot(SLOTS.implementation),
    slot(SLOTS.beacon),
    slot(SLOTS.legacyImplementation),
    slot(SLOTS.proxiable),
  ]);

  if (implementation) {
    // Transparent proxies name their admin; UUPS proxies leave it empty and check owner().
    const admin = await slot(SLOTS.admin);
    const controller = admin ? await classify(client, admin) : await ownerOf(client, address);
    return { proxy: "eip1967", implementation, controller };
  }
  if (beacon) {
    const beaconImplementation = await tryRead(client, beacon, "implementation");
    return {
      proxy: "eip1967-beacon",
      ...(beaconImplementation ? { implementation: beaconImplementation } : {}),
      controller: await ownerOf(client, beacon),
    };
  }
  if (legacy) {
    const admin = await slot(SLOTS.legacyAdmin);
    const controller: UpgradeController = admin
      ? await classify(client, admin)
      : { kind: "unknown" };
    return { proxy: "openzeppelin-legacy", implementation: legacy, controller };
  }
  if (proxiable) {
    return {
      proxy: "eip1822",
      implementation: proxiable,
      controller: await ownerOf(client, address),
    };
  }
  return { proxy: "none" };
}

/** The controller behind `contract.owner()`, or unknown if it has none. */
async function ownerOf(client: ChainReader, contract: Address): Promise<UpgradeController> {
  const owner = await tryRead(client, contract, "owner");
  return owner && !isZero(owner) ? classify(client, owner, 1) : { kind: "unknown" };
}

/** Works out what kind of account controls upgrades, following owner() through admin contracts. */
async function classify(
  client: ChainReader,
  address: Address,
  depth = 0,
): Promise<UpgradeController> {
  if (!isContractCode(await client.getCode({ address }))) {
    return { kind: "single-key", address };
  }

  const threshold = await tryRead(client, address, "getThreshold");
  const owners = threshold === null ? null : await tryRead(client, address, "getOwners");
  if (threshold !== null && owners !== null) {
    return threshold <= 1n
      ? { kind: "single-key", address }
      : { kind: "multisig", address, threshold: Number(threshold), owners: owners.length };
  }

  // A zero delay protects no one; treat it like any other admin contract.
  const delay =
    (await tryRead(client, address, "getMinDelay")) ?? (await tryRead(client, address, "delay"));
  if (delay !== null && delay > 0n) {
    return { kind: "timelock", address, delaySeconds: Number(delay) };
  }

  if (depth < MAX_DEPTH) {
    const owner = await tryRead(client, address, "owner");
    if (owner && !isZero(owner)) return classify(client, owner, depth + 1);
  }
  return { kind: "unknown", address };
}

type ViewName = (typeof abi)[number]["name"];

/**
 * Calls a view function that the contract may not have. Any failure of the call itself
 * (revert, no such function, unexpected return data) returns null; network failures are thrown.
 */
async function tryRead<N extends ViewName>(client: ChainReader, address: Address, functionName: N) {
  try {
    return await client.readContract({ address, abi, functionName });
  } catch (error) {
    const network =
      error instanceof BaseError &&
      error.walk(
        (e) =>
          e instanceof HttpRequestError ||
          e instanceof TimeoutError ||
          e instanceof LimitExceededRpcError,
      );
    if (network) throw error;
    return null;
  }
}

/** Reads a storage slot that holds an address. Empty or non-address values return null. */
async function readAddressSlot(
  client: ChainReader,
  address: Address,
  slot: Hex,
): Promise<Address | null> {
  const value = await client.getStorageAt({ address, slot });
  if (!value || value.length !== 66 || !/^0x0{24}/.test(value)) return null;
  const result = `0x${value.slice(26)}` as Address;
  return isZero(result) ? null : result;
}

function isZero(address: Address): boolean {
  return /^0x0{40}$/.test(address);
}
