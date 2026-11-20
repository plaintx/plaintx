import { getAddress, isAddress, isHex } from "viem";
import type { Address } from "./approvals.js";

/**
 * EIP-712 typed data as a wallet shows it for `eth_signTypedData_v4`, after `parseTypedData`
 * has checked it: every value has its declared type, integers are bigints, and addresses are
 * checksummed. See docs/decisions/0016-signature-explainer.md.
 */
export interface TypedData {
  domain: TypedDataDomain;
  /** Struct definitions, without EIP712Domain. */
  types: Record<string, readonly TypedDataField[]>;
  primaryType: string;
  message: Struct;
  /** The signing account, when the input was a full `eth_signTypedData_v4` request. */
  signer?: Address;
}

export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: Address;
  salt?: `0x${string}`;
}

export interface TypedDataField {
  name: string;
  type: string;
}

/** A value after checking: integers are bigints, addresses checksummed, bytes lower-case hex. */
export type TypedValue = bigint | boolean | string | Address | TypedValue[] | Struct;
export interface Struct {
  [field: string]: TypedValue;
}

/** Why pasted text is not typed data we can read. The message is shown to the user. */
export class TypedDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TypedDataError";
  }
}

/** Larger input is refused before parsing: real signature requests are a few kilobytes. */
export const MAX_INPUT_LENGTH = 100_000;
/** Deeper nesting and longer arrays are refused, so hostile input cannot run up our CPU. */
const MAX_DEPTH = 8;
const MAX_ARRAY = 200;

const DOMAIN_FIELDS: Record<string, string> = {
  name: "string",
  version: "string",
  chainId: "uint256",
  verifyingContract: "address",
  salt: "bytes32",
};

/**
 * Reads what a user pasted: the typed data object itself, the same as a JSON string (some
 * wallets show it double-encoded), the `[address, typedData]` params of `eth_signTypedData_v4`,
 * or the whole JSON-RPC request. Throws TypedDataError with a message for the user.
 */
export function parseTypedData(input: string): TypedData {
  if (input.length > MAX_INPUT_LENGTH) {
    throw new TypedDataError("That is too long to be a signature request.");
  }
  let value = parseJson(input.trim());
  let signer: Address | undefined;

  if (isObject(value) && Array.isArray(value.params)) value = value.params;
  if (Array.isArray(value)) {
    if (value.length !== 2) throw notTypedData();
    // eth_signTypedData_v4 params are [account, typedData]; v3 apps sometimes swap them.
    const [first, second] = value;
    const account =
      typeof first === "string" && isAddress(first, { strict: false }) ? first : second;
    value = account === first ? second : first;
    if (typeof account !== "string" || !isAddress(account, { strict: false })) {
      throw notTypedData();
    }
    signer = getAddress(account);
  }
  if (typeof value === "string") value = parseJson(value);
  if (!isObject(value)) throw notTypedData();

  const { types, primaryType, domain, message } = value;
  if (!isObject(types) || typeof primaryType !== "string" || !isObject(message)) {
    throw notTypedData();
  }
  const structs = readTypes(types);
  if (primaryType === "EIP712Domain" || !structs[primaryType]) {
    throw new TypedDataError(`The request's main type "${clip(primaryType)}" is not defined.`);
  }
  return {
    domain: readDomain(domain ?? {}),
    types: structs,
    primaryType,
    message: readStruct(structs, primaryType, message, 0),
    ...(signer ? { signer } : {}),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw notTypedData();
  }
}

function notTypedData(): TypedDataError {
  return new TypedDataError(
    "This doesn't look like a signature request. Paste the full JSON your wallet shows, with types, domain and message.",
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clip(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function readTypes(raw: Record<string, unknown>): Record<string, TypedDataField[]> {
  const structs: Record<string, TypedDataField[]> = {};
  for (const [name, fields] of Object.entries(raw)) {
    if (name === "EIP712Domain") continue;
    if (!/^[A-Za-z_$][\w$]*$/.test(name) || !Array.isArray(fields)) {
      throw new TypedDataError(`The type "${clip(name)}" is not valid.`);
    }
    structs[name] = fields.map((field) => {
      if (!isObject(field) || typeof field.name !== "string" || typeof field.type !== "string") {
        throw new TypedDataError(`A field of "${clip(name)}" is not valid.`);
      }
      return { name: field.name, type: field.type };
    });
  }
  return structs;
}

function readDomain(raw: unknown): TypedDataDomain {
  if (!isObject(raw)) throw new TypedDataError("The request's domain is not valid.");
  const domain: TypedDataDomain = {};
  for (const [field, type] of Object.entries(DOMAIN_FIELDS)) {
    if (raw[field] === undefined || raw[field] === null) continue;
    const value = readValue({}, type, raw[field], `domain.${field}`, 0);
    if (field === "chainId") {
      const id = value as bigint;
      if (id > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new TypedDataError("The request's chain id is not valid.");
      }
      domain.chainId = Number(id);
    } else {
      (domain as Record<string, unknown>)[field] = value;
    }
  }
  return domain;
}

function readStruct(
  structs: Record<string, readonly TypedDataField[]>,
  type: string,
  raw: unknown,
  depth: number,
): Struct {
  if (depth > MAX_DEPTH) throw new TypedDataError("The request is nested too deeply.");
  if (!isObject(raw)) throw new TypedDataError(`"${clip(type)}" should be an object.`);
  const out: Struct = {};
  for (const { name, type: fieldType } of structs[type] ?? []) {
    out[name] = readValue(structs, fieldType, raw[name], `${type}.${name}`, depth + 1);
  }
  return out;
}

const INT = /^(u?)int(\d*)$/;
const BYTES = /^bytes(\d*)$/;

function readValue(
  structs: Record<string, readonly TypedDataField[]>,
  type: string,
  raw: unknown,
  path: string,
  depth: number,
): TypedValue {
  const where = clip(path);
  const array = type.match(/^(.*)\[(\d*)\]$/);
  if (array) {
    const [, inner = "", length] = array;
    if (!Array.isArray(raw)) throw new TypedDataError(`${where} should be a list.`);
    if (raw.length > MAX_ARRAY) throw new TypedDataError(`${where} has too many items.`);
    if (length && raw.length !== Number(length)) {
      throw new TypedDataError(`${where} should have ${length} items.`);
    }
    return raw.map((item, i) => readValue(structs, inner, item, `${path}[${i}]`, depth + 1));
  }
  if (structs[type]) return readStruct(structs, type, raw, depth);

  const int = type.match(INT);
  if (int) {
    const [, unsigned, bitsText] = int;
    const bits = Number(bitsText || 256);
    if (bits < 8 || bits > 256 || bits % 8 !== 0) {
      throw new TypedDataError(`${where} has an unknown type "${clip(type)}".`);
    }
    let value = toBigInt(raw);
    if (value === undefined) throw new TypedDataError(`${where} should be a whole number.`);
    const [min, max] = unsigned
      ? [0n, 2n ** BigInt(bits) - 1n]
      : [-(2n ** BigInt(bits - 1)), 2n ** BigInt(bits - 1) - 1n];
    // A rounded JSON number for the type's maximum (e.g. 2^256-1) rounds up past it.
    if (typeof raw === "number" && !Number.isSafeInteger(raw) && value > max) value = max;
    if (value < min || value > max) throw new TypedDataError(`${where} is out of range.`);
    return value;
  }
  if (type === "address") {
    if (typeof raw !== "string" || !isAddress(raw, { strict: false })) {
      throw new TypedDataError(`${where} should be an address.`);
    }
    return getAddress(raw);
  }
  if (type === "bool") {
    if (typeof raw === "boolean") return raw;
    if (raw === "true" || raw === "false") return raw === "true";
    throw new TypedDataError(`${where} should be true or false.`);
  }
  if (type === "string") {
    if (typeof raw !== "string") throw new TypedDataError(`${where} should be text.`);
    return raw;
  }
  const bytes = type.match(BYTES);
  if (bytes) {
    if (typeof raw !== "string" || !isHex(raw)) {
      throw new TypedDataError(`${where} should be hex data.`);
    }
    const size = bytes[1] ? Number(bytes[1]) : undefined;
    if (size !== undefined && (size < 1 || size > 32 || raw.length !== 2 + size * 2)) {
      throw new TypedDataError(`${where} should be ${size} bytes.`);
    }
    return raw.toLowerCase();
  }
  throw new TypedDataError(`${where} has an unknown type "${clip(type)}".`);
}

/** Accepts numbers, decimal strings and 0x hex strings, as wallets and apps write all three. */
function toBigInt(raw: unknown): bigint | undefined {
  if (typeof raw === "bigint") return raw;
  // Above 2^53 a JSON number has already lost its exact value, but its size is right, which is
  // what the checks need ("unlimited" or not). Amounts are shown as the wallet will show them.
  if (typeof raw === "number") return Number.isInteger(raw) ? BigInt(raw) : undefined;
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  if (/^-?\d{1,80}$/.test(text) || /^0x[0-9a-fA-F]{1,64}$/.test(text)) return BigInt(text);
  return undefined;
}
