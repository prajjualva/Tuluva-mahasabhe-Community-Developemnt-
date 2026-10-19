import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const counter = () => ({ count: vi.fn().mockResolvedValue(1) });
  return {
    member: { ...counter(), groupBy: vi.fn().mockResolvedValue([{ status: "ACTIVE", _count: 3 }]) },
    coordinator: { groupBy: vi.fn().mockResolvedValue([{ status: "ACTIVE", _count: 1 }]) },
    communitySupportPlan: counter(),
    nominee: counter(),
    deathCase: counter(),
    contributionEvent: counter(),
    due: counter(),
    payment: counter(),
    cashCollection: counter(),
    cashDiscrepancy: counter(),
    supportCase: counter(),
    walletTransaction: counter(),
    foundationLedger: counter(),
    auditLog: counter(),
    communityNews: counter(),
    dueWaiverRequest: counter(),
    ledgerAdjustment: counter(),
  };
});
vi.mock("../src/server/database/prisma", () => ({ prisma: mocks }));
import { adminDashboardSnapshot } from "../src/server/admin/admin-query-service";
describe("complete Admin work queue summary", () => {
  beforeEach(() => vi.clearAllMocks());
  it("includes temporary management, waivers and adjustment decisions", async () => {
    const dashboard = await adminDashboardSnapshot();
    expect(dashboard.totalMembers).toBe(3);
    expect(dashboard.tasks).toMatchObject({
      waiverApprovals: 1,
      operationalAdjustments: 1,
      temporarilyManagedMembers: 1,
      pendingAdminTasks: 9,
    });
    expect(mocks.communitySupportPlan.count.mock.calls[0][0].where).toMatchObject({
      OR: [
        { status: "PENDING_ADMIN_APPROVAL" },
        { status: "PENDING_COORDINATOR_APPROVAL", member: { coordinatorId: null } },
      ],
    });
  });
});
