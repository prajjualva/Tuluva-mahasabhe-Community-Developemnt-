import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("../src/server/payments/payment-integrity", () => ({
  runSerializablePaymentTransaction: (operation: (tx: unknown) => unknown) =>
    operation({
      due: { findUnique: mocks.find, update: mocks.update },
      auditLog: { create: mocks.audit },
    }),
}));
vi.mock("../src/server/notifications/notification-service", () => ({
  createInAppNotificationInTransaction: mocks.notify,
}));
import { extendPlanDue } from "../src/server/plans/plan-service";
describe("persistent plan extension safeguards", () => {
  const current = new Date(Date.now() + 86400000);
  const future = new Date(Date.now() + 3 * 86400000);
  const due = {
    id: "internal",
    externalId: "public",
    purpose: "PLAN_REGISTRATION",
    status: "PENDING",
    dueAt: current,
    plan: { status: "PAYMENT_PENDING" },
    member: { userId: "member-user", status: "ACTIVE" },
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockResolvedValue(due);
    mocks.update.mockResolvedValue({ ...due, dueAt: future });
  });
  it("extends an open registration with identity, reason and audit history", async () => {
    await extendPlanDue("public", "admin-user", future, "Verified extension reason");
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({
      dueAt: future,
      status: "PENDING",
      lastReminderAt: null,
    });
    expect(mocks.audit.mock.calls[0][0].data).toMatchObject({
      actorId: "admin-user",
      reason: "Verified extension reason",
      action: "PLAN_DUE_EXTENDED",
    });
    expect(mocks.notify).toHaveBeenCalledOnce();
  });
  it("never revives cancelled/waived dues or closed/deceased membership", async () => {
    for (const override of [
      { status: "CANCELLED" },
      { status: "WAIVED" },
      { member: { ...due.member, status: "CLOSED" } },
      { member: { ...due.member, status: "DECEASED" } },
      { plan: { status: "CANCELLED" } },
    ]) {
      mocks.find.mockResolvedValue({ ...due, ...override });
      await expect(
        extendPlanDue("public", "admin-user", future, "Requested extension"),
      ).rejects.toThrow("not found or already settled");
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not shorten an existing deadline", async () => {
    await expect(
      extendPlanDue("public", "admin-user", current, "Attempted non-extension"),
    ).rejects.toThrow("later");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
