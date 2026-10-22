import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn(), dues: vi.fn() }));
vi.mock("../src/server/database/prisma", () => ({
  prisma: {
    contributionEvent: { findMany: mocks.findMany, findFirst: mocks.findFirst },
    due: { findMany: mocks.dues },
  },
}));
import {
  getPublishedDeathSupportEvent,
  listPublishedDeathSupportEvents,
} from "../src/server/death/death-workflow-service";

describe("persistent public event contribution aggregation", () => {
  beforeEach(() => vi.clearAllMocks());
  const event = {
    externalId: "event-uuid",
    status: "PUBLISHED",
    publishedAt: new Date(),
    publicDetails: "Approved notice",
    deathCase: { member: { fullName: "Member" }, dateOfDeath: new Date(), placeOfDeath: "Udupi" },
    contributions: [
      { dueId: "internal-paid" },
      { dueId: "internal-expired" },
      { dueId: "internal-waived" },
    ],
  };
  it("looks up persistent due statuses and exposes counts, never due or member IDs", async () => {
    mocks.findMany.mockResolvedValue([event]);
    mocks.dues.mockResolvedValue([
      { id: "internal-paid", status: "PAID" },
      { id: "internal-expired", status: "EXPIRED" },
      { id: "internal-waived", status: "WAIVED" },
    ]);
    const result = await listPublishedDeathSupportEvents();
    expect(result[0].contributionProgress).toEqual({
      total: 3,
      contributed: 1,
      remaining: 1,
      waived: 1,
      cancelled: 0,
    });
    expect(JSON.stringify(result)).not.toContain("internal-");
    expect(result[0]).not.toHaveProperty("contributions");
    expect(mocks.findMany.mock.calls[0][0].where.status.in).toEqual(["PUBLISHED", "CLOSED"]);
  });
  it("uses the same persistent totals on the detail page", async () => {
    mocks.findFirst.mockResolvedValue(event);
    mocks.dues.mockResolvedValue([
      { id: "internal-paid", status: "PAID" },
      { id: "internal-expired", status: "PAID" },
      { id: "internal-waived", status: "WAIVED" },
    ]);
    expect(
      (await getPublishedDeathSupportEvent("event-uuid")).contributionProgress.contributed,
    ).toBe(2);
  });
  it("handles an empty public feed without querying any private dues", async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await listPublishedDeathSupportEvents()).toEqual([]);
    expect(mocks.dues).not.toHaveBeenCalled();
  });
});
