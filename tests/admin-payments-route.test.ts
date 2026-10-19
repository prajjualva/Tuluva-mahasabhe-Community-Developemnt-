import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  payments: vi.fn(),
  count: vi.fn(),
  attention: vi.fn(),
}));
vi.mock("../src/server/http/authorize", () => ({ requireApiPermission: mocks.authorize }));
vi.mock("../src/server/database/prisma", () => ({
  prisma: {
    payment: { findMany: mocks.payments, count: mocks.count },
    auditLog: { findMany: mocks.attention },
  },
}));
import { GET } from "../src/app/api/admin/payments/route";
describe("Admin payment reconciliation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ userId: "admin" });
    mocks.count.mockResolvedValue(1);
    mocks.attention.mockResolvedValue([]);
    mocks.payments.mockResolvedValue([
      {
        id: "internal-payment",
        externalId: "public-payment",
        amountPaise: 10000,
        method: "ONLINE",
        status: "FAILED",
        createdAt: new Date(),
        member: null,
        due: { purpose: "CONTRIBUTION" },
        receipt: null,
        refund: null,
      },
    ]);
  });
  it("shows failed payments truthfully and strips database keys", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/admin/payments?status=FAILED&page=2"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-total-count")).toBe("1");
    const body = await response.json();
    expect(body[0].status).toBe("FAILED");
    expect(JSON.stringify(body)).not.toContain("internal-payment");
    expect(mocks.payments.mock.calls[0][0]).toMatchObject({
      where: { status: "FAILED" },
      skip: 50,
      take: 50,
    });
  });
  it("separates successful refunds from still-settled payments", async () => {
    await GET(new NextRequest("http://localhost/api/admin/payments?status=REFUNDED"));
    expect(mocks.payments.mock.calls[0][0].where).toEqual({ refund: { status: "SUCCEEDED" } });
  });
  it("denies non-Admin access before looking up records", async () => {
    mocks.authorize.mockRejectedValue(new Error("Forbidden"));
    expect((await GET(new NextRequest("http://localhost/api/admin/payments"))).status).toBe(403);
    expect(mocks.payments).not.toHaveBeenCalled();
  });
  it("rejects unknown status and mass-assignment query fields", async () => {
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/admin/payments?status=MADE_UP&memberId=foreign"),
        )
      ).status,
    ).toBe(403);
    expect(mocks.payments).not.toHaveBeenCalled();
  });
});
