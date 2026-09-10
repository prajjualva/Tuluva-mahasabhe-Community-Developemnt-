import { describe, expect, it } from "vitest";
import { canStartPlanRegistration } from "../src/server/plans/plan-service";

describe("closed membership plan reopening", () => {
  it("never charges an ordinary inactive member a second ₹1,000 registration", () => {
    expect(canStartPlanRegistration("INACTIVE", true, false)).toBe(false);
    expect(canStartPlanRegistration("ACTIVE", true, false)).toBe(false);
  });

  it("allows one new registration for CLOSED membership but blocks duplicate reopening attempts", () => {
    expect(canStartPlanRegistration("CLOSED", true, false)).toBe(true);
    expect(canStartPlanRegistration("CLOSED", true, true)).toBe(false);
  });
});
