import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  lifecycle: vi.fn(),
  reminders: vi.fn(),
  cash: vi.fn(),
  dues: vi.fn(),
}));
vi.mock("../src/server/membership/membership-lifecycle-service", () => ({
  processMembershipLifecycle: mocks.lifecycle,
}));
vi.mock("../src/server/notifications/due-reminder-service", () => ({
  queueOutstandingDueReminders: mocks.reminders,
}));
vi.mock("../src/server/coordinators/cash-discrepancy-job", () => ({
  escalateOverdueCashDiscrepancies: mocks.cash,
}));
vi.mock("../src/server/database/prisma", () => ({ prisma: { due: { findMany: mocks.dues } } }));
import { GET as membership } from "../src/app/api/internal/jobs/membership-dues/route";
import { GET as reminders } from "../src/app/api/internal/jobs/due-reminders/route";
import { GET as cash } from "../src/app/api/internal/jobs/cash-reconciliation/route";
import { GET as plan } from "../src/app/api/internal/jobs/plan-reminders/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  mocks.lifecycle.mockResolvedValue({ processed: 0 });
  mocks.reminders.mockResolvedValue({ queued: 0 });
  mocks.cash.mockResolvedValue({ suspended: 0 });
  mocks.dues.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
describe("deployed cron endpoints", () => {
  it("denies unauthenticated GETs before any business/database work", async () => {
    for (const handler of [membership, reminders, cash, plan])
      expect(
        (await handler(new NextRequest("http://localhost/api/internal/jobs/test"))).status,
      ).toBe(401);
    for (const operation of Object.values(mocks)) expect(operation).not.toHaveBeenCalled();
  });
  it("dispatches authenticated cron GETs to the real existing job boundaries", async () => {
    for (const handler of [membership, reminders, cash, plan]) {
      const response = await handler(
        new NextRequest("http://localhost/api/internal/jobs/test", {
          headers: { authorization: "Bearer test-cron-secret" },
        }),
      );
      expect(response.status).toBe(200);
    }
    for (const operation of Object.values(mocks)) expect(operation).toHaveBeenCalledOnce();
  });
});
