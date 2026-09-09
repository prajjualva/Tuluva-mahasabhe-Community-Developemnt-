import { describe, expect, it } from "vitest";
import {
  applyPaymentOutcome,
  allocateWalletPayment,
  extendPlanDueByAdmin,
  planStatusAfterPayment,
} from "../src/server/payments/payment-engine";
import { fifoAllocate } from "../src/server/membership/membership-engine";

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
  it("does not consume a partial wallet balance for ordinary payments", () => {
    expect(allocateWalletPayment(10000, 36900)).toEqual({ walletPaise: 0, onlinePaise: 36900 });
  });
  it("selects contribution obligations in FIFO order while allowing a specific event", () => {
    const first = {
      id: "event-one",
      purpose: "CONTRIBUTION" as const,
      amountPaise: 10000,
      createdAt: new Date("2026-01-01"),
      dueAt: new Date("2026-02-01"),
      status: "PENDING" as const,
    };
    const second = { ...first, id: "event-two", createdAt: new Date("2026-01-02") };
    expect(fifoAllocate([second, first], 10000)[0]?.dueId).toBe("event-one");
    expect(fifoAllocate([first, second], 10000, "event-two")[0]?.dueId).toBe("event-two");
  });
});
