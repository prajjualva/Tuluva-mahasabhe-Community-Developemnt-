import { describe, expect, it } from "vitest";
import {
  applyPaymentOutcome,
  extendPlanDueByAdmin,
  planStatusAfterPayment,
} from "../src/server/payments/payment-engine";

describe("Phase 6 payment state rules", () => {
  it("keeps settled outcomes immutable", () => {
    expect(applyPaymentOutcome("PENDING", "SUCCEEDED")).toBe("SUCCEEDED");
    expect(() => applyPaymentOutcome("SUCCEEDED", "FAILED")).toThrow("immutable");
  });
  it("requires recorded Admin rationale for plan expiry extensions", () => {
    expect(
      extendPlanDueByAdmin(new Date("2026-01-01"), new Date("2026-01-02"), "Document delay")
        .audited,
    ).toBe(true);
    expect(() => extendPlanDueByAdmin(new Date(), new Date(), "")).toThrow();
  });
  it("keeps approval gates after successful payment", () => {
    expect(planStatusAfterPayment("SUCCEEDED", true, false)).toBe("PENDING_COORDINATOR_APPROVAL");
  });
});
