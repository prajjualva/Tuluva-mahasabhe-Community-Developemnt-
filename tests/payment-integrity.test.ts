import { describe, expect, it } from "vitest";
import {
  assertDueSettlementAllowed,
  isDuePayable,
  officialReceiptNumber,
} from "../src/server/payments/payment-integrity";

describe("payment integrity rules", () => {
  it("keeps expired membership and contribution dues payable but locks expired plan registration", () => {
    const expiredAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-02-01T00:00:00.000Z");

    expect(
      isDuePayable({ purpose: "CONTRIBUTION", status: "EXPIRED", dueAt: expiredAt }, now),
    ).toBe(true);
    expect(isDuePayable({ purpose: "MEMBERSHIP", status: "EXPIRED", dueAt: expiredAt }, now)).toBe(
      true,
    );
    expect(
      isDuePayable({ purpose: "PLAN_REGISTRATION", status: "EXPIRED", dueAt: expiredAt }, now),
    ).toBe(false);
    expect(
      isDuePayable({ purpose: "PLAN_REGISTRATION", status: "PENDING", dueAt: expiredAt }, now),
    ).toBe(false);
  });

  it("honors a gateway capture made before a plan deadline despite delayed webhook delivery", () => {
    const due = {
      purpose: "PLAN_REGISTRATION",
      status: "EXPIRED",
      dueAt: new Date("2026-02-01T00:00:00.000Z"),
    };
    expect(() =>
      assertDueSettlementAllowed(due, new Date("2026-01-31T23:59:59.000Z")),
    ).not.toThrow();
    expect(() => assertDueSettlementAllowed(due, new Date("2026-02-01T00:00:01.000Z"))).toThrow(
      "deadline",
    );
  });

  it("derives an official receipt number from the public payment UUID", () => {
    expect(
      officialReceiptNumber("18e4e231-3f16-4a81-8e3d-194ad1d4f613", new Date("2026-02-01")),
    ).toBe("RCP-2026-18E4E2313F164A818E3D194AD1D4F613");
  });
});
