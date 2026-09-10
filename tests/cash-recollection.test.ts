import { describe, expect, it } from "vitest";
import { canCreateCashCollectionForDue } from "../src/server/coordinators/cash-payment-service";

describe("cash recollection after rejection", () => {
  it("permits a fresh collection when every prior collection was rejected", () => {
    expect(canCreateCashCollectionForDue([])).toBe(true);
    expect(canCreateCashCollectionForDue(["REJECTED"])).toBe(true);
    expect(canCreateCashCollectionForDue(["REJECTED", "REJECTED"])).toBe(true);
  });

  it("retains the one-open-or-settled-collection safety rule", () => {
    expect(canCreateCashCollectionForDue(["PENDING_ADMIN_VERIFICATION"])).toBe(false);
    expect(canCreateCashCollectionForDue(["PAID"])).toBe(false);
    expect(canCreateCashCollectionForDue(["REJECTED", "UNRESOLVED"])).toBe(false);
  });
});
