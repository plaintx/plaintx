import { describe, expect, it, vi } from "vitest";
import { createEtherscan } from "./etherscan.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";

function fakeFetch(...bodies: unknown[]) {
  return vi.fn(async (_url: string | URL | Request) => Response.json(bodies.shift()));
}

const setup = (...bodies: unknown[]) => {
  const fetch = fakeFetch(...bodies);
  const etherscan = createEtherscan({ apiKey: "KEY", fetch, sleep: async () => {} });
  const url = (call = 0) => new URL(String(fetch.mock.calls[call]?.[0]));
  return { etherscan, fetch, url };
};

const query = { chainId: 8453, topic0: "0xaa", topic1: "0xbb", fromBlock: 42 } as const;

describe("getLogs", () => {
  it("sends a topic search for the given chain and returns the logs", async () => {
    const log = { address: ADDRESS, topics: [], data: "0x", blockNumber: "0x1" };
    const { etherscan, url } = setup({ status: "1", message: "OK", result: [log] });

    expect(await etherscan.getLogs(query)).toEqual([log]);
    const params = url().searchParams;
    expect(params.get("chainid")).toBe("8453");
    expect(params.get("topic0")).toBe("0xaa");
    expect(params.get("topic1")).toBe("0xbb");
    expect(params.get("topic0_1_opr")).toBe("and");
    expect(params.get("fromBlock")).toBe("42");
    expect(params.get("apikey")).toBe("KEY");
    expect(params.has("address")).toBe(false);
  });

  it("returns an empty list when there are no records", async () => {
    const { etherscan } = setup({ status: "0", message: "No records found", result: [] });
    expect(await etherscan.getLogs(query)).toEqual([]);
  });

  it("retries after hitting the rate limit", async () => {
    const { etherscan, fetch } = setup(
      { status: "0", message: "NOTOK", result: "Max calls per sec rate limit reached (5/sec)" },
      { status: "1", message: "OK", result: [] },
    );
    expect(await etherscan.getLogs(query)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws Etherscan's error message", async () => {
    const { etherscan } = setup({ status: "0", message: "NOTOK", result: "Invalid API Key" });
    await expect(etherscan.getLogs(query)).rejects.toThrow("Etherscan: Invalid API Key");
  });
});

describe("isVerified", () => {
  it("is true when source code is published", async () => {
    const { etherscan, url } = setup({
      status: "1",
      message: "OK",
      result: [{ SourceCode: "contract X {}" }],
    });
    expect(await etherscan.isVerified(1, ADDRESS)).toBe(true);
    expect(url().searchParams.get("action")).toBe("getsourcecode");
  });

  it("is false when the source is empty", async () => {
    const { etherscan } = setup({ status: "1", message: "OK", result: [{ SourceCode: "" }] });
    expect(await etherscan.isVerified(1, ADDRESS)).toBe(false);
  });
});
