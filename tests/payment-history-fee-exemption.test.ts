import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ auth: vi.fn(), member: vi.fn(), payments: vi.fn() }));
vi.mock("../src/server/http/authorize", () => ({ requireApiPermission: m.auth }));
vi.mock("../src/server/payments/payment-service", () => ({ memberIdForUser: m.member }));
vi.mock("../src/server/database/prisma", () => ({ prisma: { payment: { findMany: m.payments } } }));
import { GET } from "../src/app/api/member/payments/history/route";
describe("fee-exempt payment history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ userId: "owner" });
    m.member.mockResolvedValue("member-db-id");
  });
  it("retains the real pending gateway status but removes checkout access for the waived fee", async () => {
    m.payments.mockResolvedValue([
      {
        externalId: crypto.randomUUID(),
        amountPaise: 100000,
        method: "ONLINE",
        status: "PENDING",
        providerOrderId: "order_retained",
        due: {
          purpose: "PLAN_REGISTRATION",
          status: "WAIVED",
          dueAt: new Date(Date.now() + 86400000),
        },
        createdAt: new Date(),
        receipt: null,
        refund: null,
        membershipPack: null,
      },
    ]);
    const response = await GET(
      new NextRequest("https://example.invalid/api/member/payments/history"),
    );
    expect((await response.json())[0]).toMatchObject({
      status: "PENDING",
      feeExempted: true,
      canResume: false,
      canVerify: true,
      receipt: null,
      membershipDocumentsAvailable: false,
    });
    expect(m.payments.mock.calls[0][0].where).toEqual({ memberId: "member-db-id" });
  });
  it("denies access before loading payment records", async () => {
    m.auth.mockRejectedValue(new Error("Forbidden"));
    expect(
      (await GET(new NextRequest("https://example.invalid/api/member/payments/history"))).status,
    ).toBe(403);
    expect(m.payments).not.toHaveBeenCalled();
  });
});
