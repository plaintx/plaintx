import { describe, expect, it } from "vitest";
import { redactSecrets, secretValues } from "./redact";

const KEY = "AbCdEf0123456789xyz"; // gitleaks:allow (fake test value)

describe("secretValues", () => {
  it("includes each value and the key-like parts of URLs, longest first", () => {
    const secrets = secretValues({
      ETH_RPC_URL: `https://eth-mainnet.g.alchemy.com/v2/${KEY}`,
      ETHERSCAN_API_KEY: "ETHERSCANKEY1234", // gitleaks:allow (fake test value)
      DATABASE_URL: "postgres://user:s3cretpassword123@db.example/plaintx",
      UNRELATED: "not a secret",
    });
    expect(secrets).toEqual([
      `https://eth-mainnet.g.alchemy.com/v2/${KEY}`,
      "postgres://user:s3cretpassword123@db.example/plaintx",
      KEY,
      "s3cretpassword123",
      "ETHERSCANKEY1234",
    ]);
  });

  it("skips unset and short values", () => {
    expect(secretValues({ ETH_RPC_URL: "", REDIS_URL: "redis://localhost:6379" })).toEqual([
      "redis://localhost:6379",
    ]);
  });
});

describe("redactSecrets", () => {
  const secrets = secretValues({ ETH_RPC_URL: `https://eth-mainnet.g.alchemy.com/v2/${KEY}` });

  it("replaces secrets anywhere in the event", () => {
    const event = {
      message: `fetch failed: https://eth-mainnet.g.alchemy.com/v2/${KEY}`,
      breadcrumbs: [{ data: { url: `/v2/${KEY}?x=1` } }],
      untouched: 42,
    };
    expect(redactSecrets(event, secrets)).toEqual({
      message: "fetch failed: <redacted>",
      breadcrumbs: [{ data: { url: "/v2/<redacted>?x=1" } }],
      untouched: 42,
    });
  });

  it("handles secrets with characters JSON escapes", () => {
    const quoted = 'pa"ss\\word-long-enough';
    expect(redactSecrets({ m: `x ${quoted} y` }, [quoted])).toEqual({ m: "x <redacted> y" });
  });

  it("returns the value unchanged when there are no secrets", () => {
    const event = { message: "hi" };
    expect(redactSecrets(event, [])).toBe(event);
  });
});
