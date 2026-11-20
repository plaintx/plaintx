import { describe, expect, it } from "vitest";
import { isCronRequest } from "./cron-auth";

const SECRET = "a-long-random-cron-secret";
const request = (authorization?: string) =>
  new Request("https://plaintx.app/api/cron/prune", {
    headers: authorization ? { authorization } : {},
  });

describe("isCronRequest", () => {
  it("accepts exactly the configured bearer secret", () => {
    expect(isCronRequest(request(`Bearer ${SECRET}`), SECRET)).toBe(true);
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", "Bearer a-long-random-cron-secreT"],
    ["the secret without Bearer", SECRET],
    ["a longer value", `Bearer ${SECRET}x`],
  ])("refuses %s", (_name, header) => {
    expect(isCronRequest(request(header), SECRET)).toBe(false);
  });

  it("refuses everyone when no secret, or a short one, is configured", () => {
    expect(isCronRequest(request("Bearer "), undefined)).toBe(false);
    expect(isCronRequest(request("Bearer "), "")).toBe(false);
    expect(isCronRequest(request("Bearer short"), "short")).toBe(false);
  });
});
