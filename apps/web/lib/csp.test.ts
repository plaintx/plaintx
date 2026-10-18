import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, rpcOrigins } from "./csp";

const directives = (csp: string) => new Map(csp.split("; ").map((d) => [d.split(" ")[0], d]));

describe("contentSecurityPolicy", () => {
  it("allows only nonced scripts and styles in production", () => {
    const csp = directives(
      contentSecurityPolicy({ nonce: "abc", dev: false, connect: ["https://rpc.example"] }),
    );
    expect(csp.get("script-src")).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp.get("style-src")).toBe("style-src 'self' 'nonce-abc'");
    expect(csp.get("connect-src")).toBe("connect-src 'self' https://rpc.example");
    expect(csp.get("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(csp.has("upgrade-insecure-requests")).toBe(true);
    expect([...csp.values()].join(" ")).not.toContain("unsafe");
  });

  it("relaxes only what next dev needs", () => {
    const csp = directives(contentSecurityPolicy({ nonce: "abc", dev: true, connect: [] }));
    expect(csp.get("script-src")).toContain("'unsafe-eval'");
    expect(csp.get("style-src")).toBe("style-src 'self' 'unsafe-inline'");
    expect(csp.get("connect-src")).toBe("connect-src 'self'");
    expect(csp.has("upgrade-insecure-requests")).toBe(false);
  });
});

describe("rpcOrigins", () => {
  it("keeps each origin once, without paths", () => {
    const chain = (...http: string[]) => ({ rpcUrls: { default: { http } } });
    expect(
      rpcOrigins([
        chain("https://a.example/rpc", "https://b.example"),
        chain("https://a.example/v2"),
      ]),
    ).toEqual(["https://a.example", "https://b.example"]);
  });
});
