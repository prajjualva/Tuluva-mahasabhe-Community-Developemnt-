import { describe, expect, it } from "vitest";
import { MONEY } from "../src/domain/money";
import {
  applyPaymentOutcome,
  allocateWalletPayment,
  extendPlanDueByAdmin,
  planRegistrationDue,
  planStatusAfterPayment,
  receiptNumber,
} from "../src/server/payments/payment-engine";
import { paymentCommandKey } from "../src/server/payments/idempotency";
import { cashReceiptNumber, createCashCollection } from "../src/server/coordinators/cash-service";
import {
  duesNeedingReminder,
  planDuesNeedingExpiry,
} from "../src/server/notifications/reminder-scheduler";

describe("Phase 6 payment command rules", () => {
  it("keeps all terminal payment states immutable", () => {
    for (const status of ["SUCCEEDED", "FAILED", "CANCELLED"] as const) {
      expect(() => applyPaymentOutcome(status, "SUCCEEDED")).toThrow("immutable");
    }
    expect(applyPaymentOutcome("PENDING", "FAILED")).toBe("FAILED");
    expect(applyPaymentOutcome("PENDING", "CANCELLED")).toBe("CANCELLED");
  });

  it("uses a full wallet balance before online payment and permits plan-only split payments", () => {
    expect(allocateWalletPayment(50_000, 36_900)).toEqual({
      walletPaise: 36_900,
      onlinePaise: 0,
    });
    expect(allocateWalletPayment(50_000, MONEY.planRegistration, true)).toEqual({
      walletPaise: 50_000,
      onlinePaise: 50_000,
    });
    expect(allocateWalletPayment(50_000, MONEY.planRegistration)).toEqual({
      walletPaise: 0,
      onlinePaise: MONEY.planRegistration,
    });
  });

  it("preserves the required payment and approval progression", () => {
    expect(planStatusAfterPayment("FAILED", true, true)).toBe("PAYMENT_PENDING");
    expect(planStatusAfterPayment("SUCCEEDED", true, true)).toBe("PENDING_COORDINATOR_APPROVAL");
    expect(planStatusAfterPayment("SUCCEEDED", false, true)).toBe("PENDING_ADMIN_APPROVAL");
    expect(planStatusAfterPayment("SUCCEEDED", false, false)).toBe("ACTIVE");
  });

  it("records the exact ₹1,000 30-day registration obligation", () => {
    const startedAt = new Date("2026-01-31T12:00:00.000Z");
    const registration = planRegistrationDue(startedAt);

    expect(registration.amountPaise).toBe(MONEY.planRegistration);
    expect(registration.status).toBe("PENDING");
    expect(registration.dueAt).toEqual(new Date("2026-03-02T12:00:00.000Z"));
  });

  it("requires an actual later deadline and written rationale for an Admin extension", () => {
    const currentDueAt = new Date("2026-02-01T00:00:00.000Z");
    const extended = extendPlanDueByAdmin(
      currentDueAt,
      new Date("2026-02-02T00:00:00.000Z"),
      "Awaiting verified payment evidence",
    );

    expect(extended).toMatchObject({ audited: true, reason: "Awaiting verified payment evidence" });
    expect(() => extendPlanDueByAdmin(currentDueAt, currentDueAt, "Evidence")).toThrow(
      "later expiry",
    );
    expect(() => extendPlanDueByAdmin(currentDueAt, new Date("2026-02-02"), "   ")).toThrow(
      "reason",
    );
  });

  it("creates deterministic receipt and actor-scoped idempotency references", () => {
    const actorOne = "8e4e2317-3f16-4a81-8e3d-194ad1d4f613";
    const actorTwo = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    const requestKey = "payment-command-0001";

    expect(receiptNumber(42, 2026)).toBe("RCP-2026-000042");
    expect(paymentCommandKey(actorOne, requestKey)).toBe(`${actorOne}:${requestKey}`);
    expect(paymentCommandKey(actorOne, requestKey)).not.toBe(
      paymentCommandKey(actorTwo, requestKey),
    );
  });
});

describe("Phase 6 cash collection rules", () => {
  it("uses UTC and a fixed sequence for cash receipt numbers", () => {
    expect(cashReceiptNumber(7, new Date("2026-12-31T23:59:59.000Z"))).toBe("CASH-2026-000007");
    expect(() => cashReceiptNumber(0)).toThrow("sequence");
    expect(() => cashReceiptNumber(1.5)).toThrow("sequence");
  });

  it("requires verified plan approval before a Coordinator can collect plan cash", () => {
    expect(() =>
      createCashCollection({
        amountPaise: MONEY.planRegistration,
        purpose: "PLAN",
        unresolvedDiscrepancy: false,
        sequence: 3,
      }),
    ).toThrow("Admin approval");

    expect(
      createCashCollection({
        amountPaise: MONEY.planRegistration,
        purpose: "PLAN",
        hasPlanApproval: true,
        unresolvedDiscrepancy: false,
        sequence: 3,
      }),
    ).toMatchObject({
      status: "RECEIVED_BY_COORDINATOR",
      nextStatus: "PENDING_ADMIN_VERIFICATION",
      receiptNumber: "CASH-2026-000003",
    });
  });

  it("blocks discrepancies and non-positive manual collections before persistence", () => {
    expect(() =>
      createCashCollection({
        amountPaise: MONEY.contribution,
        purpose: "CONTRIBUTION",
        unresolvedDiscrepancy: true,
        sequence: 1,
      }),
    ).toThrow("discrepancy");
    expect(() =>
      createCashCollection({
        amountPaise: 0,
        purpose: "MEMBERSHIP",
        unresolvedDiscrepancy: false,
        sequence: 1,
      }),
    ).toThrow("positive integer");
  });
});

describe("Phase 6 deadline reminders", () => {
  it("sends a reminder at the five-day boundary but never after expiry", () => {
    const now = new Date("2026-02-01T00:00:00.000Z");
    const lastReminderAt = new Date("2026-01-27T00:00:00.000Z");

    expect(
      duesNeedingReminder(
        [
          {
            id: "still-payable",
            status: "PENDING",
            dueAt: new Date("2026-02-02T00:00:00.000Z"),
            lastReminderAt,
          },
        ],
        now,
      ),
    ).toHaveLength(1);
    expect(
      duesNeedingReminder(
        [
          {
            id: "expired",
            status: "OVERDUE",
            dueAt: now,
            lastReminderAt,
          },
        ],
        now,
      ),
    ).toHaveLength(0);
  });

  it("selects payable registration dues exactly on or after their deadline", () => {
    const deadline = new Date("2026-02-01T00:00:00.000Z");

    expect(
      planDuesNeedingExpiry([{ id: "at-deadline", status: "PENDING", dueAt: deadline }], deadline),
    ).toHaveLength(1);
    expect(
      planDuesNeedingExpiry([{ id: "cancelled", status: "CANCELLED", dueAt: deadline }], deadline),
    ).toHaveLength(0);
  });
});
