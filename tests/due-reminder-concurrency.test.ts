import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  notify: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("../src/server/database/prisma", () => ({
  prisma: {
    due: { findMany: mocks.findMany },
    $transaction: (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        due: { updateMany: mocks.updateMany },
        auditLog: { create: mocks.audit },
      }),
  },
}));
vi.mock("../src/server/notifications/notification-service", () => ({
  createInAppNotificationInTransaction: mocks.notify,
}));
import { queueOutstandingDueReminders } from "../src/server/notifications/due-reminder-service";

describe("concurrent due reminders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not notify when another worker has already claimed the reminder", async () => {
    const now = new Date("2026-10-18T12:00:00Z");
    mocks.findMany.mockResolvedValue([
      {
        id: "due",
        externalId: "public-due",
        purpose: "CONTRIBUTION",
        status: "PENDING",
        dueAt: new Date("2026-11-01"),
        lastReminderAt: null,
        member: { userId: "recipient" },
      },
    ]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await queueOutstandingDueReminders(now)).toEqual({ queued: 0 });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.updateMany.mock.calls[0][0].where).toMatchObject({
      member: { status: { notIn: ["DECEASED", "CLOSED"] } },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: new Date("2026-10-13T12:00:00Z") } }],
    });
  });
});
