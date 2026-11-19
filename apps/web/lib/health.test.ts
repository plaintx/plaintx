import { describe, expect, it, vi } from "vitest";
import { cached, checkHealth, requiredEnv } from "./health";

const fullEnv = {
  ETHERSCAN_API_KEY: "key",
  ETH_RPC_URL: "https://eth.example",
  ARBITRUM_RPC_URL: "https://arb.example",
  DATABASE_URL: "postgres://db",
};

describe("requiredEnv", () => {
  it("needs the Etherscan key and an RPC URL for each scannable chain only", () => {
    expect(requiredEnv()).toEqual(["ETHERSCAN_API_KEY", "ETH_RPC_URL", "ARBITRUM_RPC_URL"]);
  });
});

describe("checkHealth", () => {
  it("is ok when everything is configured and Redis answers", async () => {
    const health = await checkHealth({
      env: { ...fullEnv, VERCEL_GIT_COMMIT_SHA: "33d4475abcdef" },
      redis: async () => "ok",
    });
    expect(health).toEqual({
      status: "ok",
      checks: { config: "ok", redis: "ok", database: "configured" },
      commit: "33d4475",
    });
  });

  it("is down when a key every scan needs is missing or blank", async () => {
    const health = await checkHealth({
      env: { ...fullEnv, ARBITRUM_RPC_URL: " " },
      redis: async () => "ok",
    });
    expect(health.status).toBe("down");
    expect(health.checks.config).toBe("missing");
  });

  it("is degraded when Redis is down or the cache is not configured", async () => {
    const redisDown = await checkHealth({ env: fullEnv, redis: async () => "down" });
    expect(redisDown.status).toBe("degraded");
    const noDb = await checkHealth({
      env: { ...fullEnv, DATABASE_URL: undefined },
      redis: async () => "ok",
    });
    expect(noDb).toMatchObject({ status: "degraded", checks: { database: "not_configured" } });
  });

  it("names no variables or values", async () => {
    const health = await checkHealth({ env: {}, redis: async () => "not_configured" });
    const text = JSON.stringify(health);
    expect(text).not.toMatch(/ETHERSCAN|RPC|postgres|https?:/);
    expect(health).not.toHaveProperty("commit");
  });
});

describe("cached", () => {
  it("runs the check once per period and shares it with concurrent callers", async () => {
    let time = 0;
    const check = vi.fn(async () => time);
    const get = cached(check, 30_000, () => time);
    expect(await Promise.all([get(), get()])).toEqual([0, 0]);
    time = 29_999;
    expect(await get()).toBe(0);
    time = 30_000;
    expect(await get()).toBe(30_000);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed check", async () => {
    const check = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue("ok");
    const get = cached(check, 30_000, () => 0);
    await expect(get()).rejects.toThrow("boom");
    expect(await get()).toBe("ok");
  });
});
