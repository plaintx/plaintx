import { describe, expect, it } from "vitest";
import { OWNER, SPENDER, USDC, usdcPermit } from "./fixtures/typed-data.js";
import { MAX_INPUT_LENGTH, parseTypedData, TypedDataError } from "./typed-data.js";

describe("parseTypedData", () => {
  it("reads typed data and normalizes its values", () => {
    const data = parseTypedData(JSON.stringify(usdcPermit));
    expect(data.primaryType).toBe("Permit");
    expect(data.domain).toEqual({
      name: "USD Coin",
      version: "2",
      chainId: 1,
      verifyingContract: USDC,
    });
    expect(data.types).not.toHaveProperty("EIP712Domain");
    expect(data.message).toEqual({
      owner: OWNER,
      spender: SPENDER,
      value: 2n ** 256n - 1n,
      nonce: 0n,
      deadline: 0x6553f100n,
    });
    expect(data.signer).toBeUndefined();
  });

  it("reads a double-encoded string, the RPC params and the whole RPC request", () => {
    const json = JSON.stringify(usdcPermit);
    expect(parseTypedData(JSON.stringify(json)).primaryType).toBe("Permit");
    const params = [OWNER.toUpperCase().replace("0X", "0x"), json];
    expect(parseTypedData(JSON.stringify(params)).signer).toBe(OWNER);
    // Some apps put the typed data first.
    expect(parseTypedData(JSON.stringify([usdcPermit, OWNER])).signer).toBe(OWNER);
    const request = { jsonrpc: "2.0", method: "eth_signTypedData_v4", params };
    expect(parseTypedData(JSON.stringify(request)).signer).toBe(OWNER);
  });

  it("reads nested structs and arrays, including fixed-size ones", () => {
    const data = parseTypedData(
      JSON.stringify({
        types: {
          Pair: [
            { name: "who", type: "address[2]" },
            { name: "tags", type: "string[]" },
          ],
          Outer: [
            { name: "pairs", type: "Pair[]" },
            { name: "ok", type: "bool" },
            { name: "data", type: "bytes" },
            { name: "id", type: "bytes4" },
            { name: "delta", type: "int8" },
          ],
        },
        primaryType: "Outer",
        domain: {},
        message: {
          pairs: [{ who: [OWNER, SPENDER], tags: ["a"] }],
          ok: "true",
          data: "0xABCD",
          id: "0x12345678",
          delta: -128,
        },
      }),
    );
    expect(data.message).toEqual({
      pairs: [{ who: [OWNER, SPENDER], tags: ["a"] }],
      ok: true,
      data: "0xabcd",
      id: "0x12345678",
      delta: -128n,
    });
  });

  it.each([
    ["not JSON", "hello", /doesn't look like a signature request/],
    ["JSON without typed data", '{"a":1}', /doesn't look like/],
    [
      "an undefined main type",
      JSON.stringify({ ...usdcPermit, primaryType: "Nope" }),
      /not defined/,
    ],
    [
      "EIP712Domain as the main type",
      JSON.stringify({ ...usdcPermit, primaryType: "EIP712Domain" }),
      /not defined/,
    ],
    [
      "a bad address",
      JSON.stringify({ ...usdcPermit, message: { ...usdcPermit.message, spender: "0x12" } }),
      /Permit.spender should be an address/,
    ],
    [
      "a negative uint",
      JSON.stringify({ ...usdcPermit, message: { ...usdcPermit.message, nonce: -1 } }),
      /Permit.nonce is out of range/,
    ],
    [
      "a uint256 too large",
      JSON.stringify({
        ...usdcPermit,
        message: { ...usdcPermit.message, value: (2n ** 256n).toString() },
      }),
      /out of range/,
    ],
    [
      "a fraction",
      JSON.stringify({ ...usdcPermit, message: { ...usdcPermit.message, value: "1.5" } }),
      /should be a whole number/,
    ],
    [
      "an unknown type",
      JSON.stringify({ ...usdcPermit, types: { Permit: [{ name: "x", type: "uint7" }] } }),
      /unknown type/,
    ],
    [
      "a chain id beyond safe integers",
      JSON.stringify({ ...usdcPermit, domain: { chainId: (2n ** 60n).toString() } }),
      /chain id is not valid/,
    ],
    ["params of the wrong length", JSON.stringify([OWNER]), /doesn't look like/],
  ])("refuses %s", (_name, input, message) => {
    expect(() => parseTypedData(input)).toThrow(TypedDataError);
    expect(() => parseTypedData(input)).toThrow(message);
  });

  it("refuses oversized input before parsing", () => {
    expect(() => parseTypedData(" ".repeat(MAX_INPUT_LENGTH + 1))).toThrow(/too long/);
  });

  it("refuses types that refer to themselves without end", () => {
    const loop = {
      types: { Node: [{ name: "next", type: "Node" }] },
      primaryType: "Node",
      domain: {},
      message: {},
    };
    let nested: Record<string, unknown> = {};
    loop.message = nested;
    for (let i = 0; i < 20; i++) {
      const next = {};
      nested.next = next;
      nested = next;
    }
    expect(() => parseTypedData(JSON.stringify(loop))).toThrow(
      /nested too deeply|should be an object/,
    );
  });

  it("accepts large JSON numbers by size, since their exact value is already lost", () => {
    const input = JSON.stringify(usdcPermit).replace(
      `"${usdcPermit.message.value}"`,
      usdcPermit.message.value,
    );
    const value = parseTypedData(input).message.value as bigint;
    expect(value >= 2n ** 255n).toBe(true);
  });
});
