import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPES } from "../src/server/notifications/notification-service";
import {
  duesNeedingReminder,
  planDuesNeedingExpiry,
} from "../src/server/notifications/reminder-scheduler";

describe("Phase 9 notification policy", () => {
  it("declares every durable in-app notification category required by the Foundation", () => {
    expect(NOTIFICATION_TYPES).toEqual(
      expect.arrayContaining([
        "REGISTRATION",
        "EMAIL_VERIFICATION",
        "MOBILE_VERIFICATION",
        "COORDINATOR_ASSIGNED",
        "COORDINATOR_CHANGED",
        "DUE_REMINDER",
        "DUE_EXPIRED",
        "MEMBERSHIP_GRACE_PERIOD",
        "PLAN_REGISTRATION",
        "PLAN_EXPIRY",
        "PAYMENT_SUCCEEDED",
        "PAYMENT_FAILED",
        "RECEIPT_GENERATED",
        "WALLET_CREDIT",
        "WALLET_PAYMENT",
        "DEATH_REPORT",
        "DEATH_SUPPORT_EVENT_APPROVED",
        "DEATH_SUPPORT_EVENT_REJECTED",
        "EVENT_CONTRIBUTION_DUE",
        "SUPPORT_PAYMENT",
        "NOMINEE_VERIFICATION",
        "CASH_COLLECTION",
        "CASH_DISCREPANCY",
        "COORDINATOR_SUSPENDED",
        "COORDINATOR_RESTORED",
        "FOUNDATION_ADMIN_TEMPORARY_MANAGEMENT",
        "COORDINATOR_RETURN",
      ]),
    );
  });

  it("uses five full days for reminder cadence and never reminds expired dues", () => {
    const now = new Date("2026-09-29T10:00:00.000Z");
    const dues = [
      {
        id: "ready",
        status: "PENDING" as const,
        dueAt: new Date("2026-10-10T10:00:00.000Z"),
        lastReminderAt: new Date("2026-09-24T10:00:00.000Z"),
      },
      {
        id: "too-soon",
        status: "PENDING" as const,
        dueAt: new Date("2026-10-10T10:00:00.000Z"),
        lastReminderAt: new Date("2026-09-24T10:00:01.000Z"),
      },
      {
        id: "expired",
        status: "PENDING" as const,
        dueAt: new Date("2026-09-29T10:00:00.000Z"),
        lastReminderAt: null,
      },
    ];
    expect(duesNeedingReminder(dues, now).map((due) => due.id)).toEqual(["ready"]);
    expect(planDuesNeedingExpiry(dues, now).map((due) => due.id)).toEqual(["expired"]);
  });
});
