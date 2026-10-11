import { describe, expect, it } from "vitest";
import { type Finding, verdictFrom } from "./verdict.js";

const caution: Finding = {
  id: "unverified-contract",
  level: "caution",
  summary: "Contract source is not verified.",
};
const danger: Finding = {
  id: "unlimited-approval",
  level: "danger",
  summary: "Grants unlimited spending of your tokens.",
};

describe("verdictFrom", () => {
  it("reports no known risks when there are no findings", () => {
    expect(verdictFrom([]).level).toBe("no_known_risks");
  });

  it("takes the worst finding", () => {
    expect(verdictFrom([caution]).level).toBe("caution");
    expect(verdictFrom([caution, danger]).level).toBe("danger");
  });
});
