import { describe, expect, it } from "vitest";
import { clientKey } from "./client-ip";

const key = (forwardedFor: string | null, trustedProxies = 0) =>
  clientKey(
    new Headers(forwardedFor === null ? {} : { "x-forwarded-for": forwardedFor }),
    trustedProxies,
  );

describe("clientKey", () => {
  it("takes the address the trusted proxy saw, ignoring what the client wrote", () => {
    expect(key("203.0.113.7", 1)).toBe("203.0.113.7");
    expect(key("1.1.1.1, 203.0.113.7", 1)).toBe("203.0.113.7");
  });

  it("skips the entries added by proxies behind the first one", () => {
    expect(key("1.1.1.1, 203.0.113.7, 10.0.0.2", 2)).toBe("203.0.113.7");
  });

  it("uses the address Next.js filled in when there is no proxy", () => {
    expect(key("203.0.113.7", 0)).toBe("203.0.113.7");
  });

  it("falls back to one shared key when the address is missing or invalid", () => {
    expect(key(null)).toBe("unknown");
    expect(key("10.0.0.2", 2)).toBe("unknown");
    expect(key("not-an-ip")).toBe("unknown");
  });

  it("limits IPv6 clients per /64", () => {
    expect(key("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(key("2001:db8:1:2:bbbb:cccc:dddd:eeee")).toBe("2001:db8:1:2::/64");
    expect(key("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(key("::1")).toBe("0:0:0:0::/64");
    expect(key("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("reads IPv4 addresses written in IPv6 form", () => {
    expect(key("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(key("::ffff:cb00:7107")).toBe("203.0.113.7");
  });
});
