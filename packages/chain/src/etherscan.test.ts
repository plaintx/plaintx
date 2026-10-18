import { describe, expect, it, vi } from "vitest";
import { createEtherscan, UnsupportedChainError } from "./etherscan.js";

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

  it("waits for the throttle before every call, retries included", async () => {
    const fetch = fakeFetch(
      { status: "0", message: "NOTOK", result: "Max calls per sec rate limit reached (5/sec)" },
      { status: "1", message: "OK", result: [] },
    );
    const throttle = vi.fn(async () => {});
    const etherscan = createEtherscan({ apiKey: "KEY", fetch, sleep: async () => {}, throttle });
    await etherscan.getLogs(query);
    expect(throttle).toHaveBeenCalledTimes(2);
  });

  it("gives up when the throttle does", async () => {
    const fetch = fakeFetch();
    const throttle = () => Promise.reject(new Error("queue full"));
    const etherscan = createEtherscan({ apiKey: "KEY", fetch, throttle });
    await expect(etherscan.getLogs(query)).rejects.toThrow("queue full");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("spaces calls made at the same time by default", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const etherscan = createEtherscan({
      apiKey: "KEY",
      fetch: fakeFetch(...Array(3).fill({ status: "1", message: "OK", result: [] })),
      sleep,
    });
    await Promise.all([
      etherscan.getLogs(query),
      etherscan.getLogs(query),
      etherscan.getLogs(query),
    ]);
    const waits = sleep.mock.calls.map(([ms]) => ms);
    expect(waits).toHaveLength(2);
    expect(waits[1]).toBeGreaterThan(waits[0] ?? Infinity);
  });

  it("throws Etherscan's error message", async () => {
    const { etherscan } = setup({ status: "0", message: "NOTOK", result: "Invalid API Key" });
    await expect(etherscan.getLogs(query)).rejects.toThrow("Etherscan: Invalid API Key");
  });

  it("tells a chain outside the API plan apart from other errors", async () => {
    const { etherscan } = setup({
      status: "0",
      message: "NOTOK",
      result: "Free API access is not supported for this chain. Please upgrade your api plan.",
    });
    await expect(etherscan.getLogs(query)).rejects.toThrow(UnsupportedChainError);
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
