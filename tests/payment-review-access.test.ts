import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), requirePagePermission: vi.fn() }));
vi.mock("../src/server/database/prisma", () => ({
  prisma: { user: { findUniqueOrThrow: mocks.user } },
}));
vi.mock("../src/server/http/page-authorize", () => ({
  requirePagePermission: mocks.requirePagePermission,
}));

import PaymentReviewPage from "../src/app/payment-review/page";
import { loginDestination } from "../src/server/auth/login-destination";

describe("payment review access", () => {
  it("directs a dedicated reviewer with no production member profile to the review workspace", async () => {
    mocks.user.mockResolvedValueOnce({
      roles: [{ role: { code: "PAYMENT_REVIEWER" } }],
      member: null,
    });
    await expect(loginDestination("reviewer")).resolves.toBe("/payment-review");
  });

  it("keeps ordinary members in the main member workspace", async () => {
    mocks.user.mockResolvedValueOnce({
      roles: [{ role: { code: "MEMBER" } }],
      member: { status: "ACTIVE", coordinatorProfile: null },
    });
    await expect(loginDestination("member")).resolves.toBe("/member");
  });

  it("requires the dedicated permission before exposing the synthetic member view", async () => {
    mocks.requirePagePermission.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(PaymentReviewPage()).rejects.toThrow("Forbidden");
    expect(mocks.requirePagePermission).toHaveBeenCalledWith("payment:review", "/payment-review");
    mocks.requirePagePermission.mockResolvedValueOnce(undefined);
    expect((await PaymentReviewPage()).props).toEqual({ livePortal: false, paymentReview: true });
  });
});
