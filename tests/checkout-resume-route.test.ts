import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), find: vi.fn(), checkout: vi.fn() }));
vi.mock("../src/server/http/authorize", () => ({ requireApiPermission: mocks.authorize }));
vi.mock("../src/server/database/prisma", () => ({
  prisma: { payment: { findFirst: mocks.find } },
}));
vi.mock("../src/server/payments/online-payment-service", () => ({
  createOnlineCheckout: mocks.checkout,
}));
import { POST } from "../src/app/api/member/payments/[paymentId]/resume/route";
describe("member checkout recovery boundary", () => {
  const externalId = "89ca8ef5-2f29-414a-b2c0-d0ef84322d35";
  const payment = {
    id: "internal-payment",
    externalId,
    amountPaise: 36900,
    idempotencyKey: "persisted-command-key",
    due: { purpose: "MEMBERSHIP", status: "PENDING", dueAt: new Date(Date.now() + 86400000) },
  };
  const invoke = () =>
    POST(
      new NextRequest(`http://localhost/api/member/payments/${externalId}/resume`, {
        method: "POST",
      }),
      { params: Promise.resolve({ paymentId: externalId }) },
    );
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ userId: "owner" });
    mocks.find.mockResolvedValue(payment);
    mocks.checkout.mockResolvedValue({
      available: true,
      checkout: {
        provider: "razorpay",
        orderId: "same-existing-order",
        amountPaise: 36900,
        currency: "INR",
      },
    });
  });
  it("uses owned persisted payment amount and command, not a client-selected amount", async () => {
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(mocks.find.mock.calls[0][0].where).toMatchObject({
      externalId,
      member: { userId: "owner" },
      method: "ONLINE",
      status: "PENDING",
    });
    expect(mocks.checkout.mock.calls[0][0]).toMatchObject({
      paymentId: payment.id,
      amountPaise: 36900,
      idempotencyKey: payment.idempotencyKey,
    });
    expect(JSON.stringify(await response.json())).not.toMatch(
      /internal-payment|persisted-command-key/,
    );
  });
  it("does not resume another member's or settled payment", async () => {
    mocks.find.mockResolvedValue(null);
    expect((await invoke()).status).toBe(404);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("does not reopen a cancelled obligation or expired ₹1,000 checkout", async () => {
    for (const due of [
      { ...payment.due, status: "CANCELLED" },
      { ...payment.due, purpose: "PLAN_REGISTRATION", dueAt: new Date(Date.now() - 1000) },
    ]) {
      mocks.find.mockResolvedValue({ ...payment, due });
      expect((await invoke()).status).toBe(400);
    }
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("reports provider unavailability without pretending the payment succeeded", async () => {
    mocks.checkout.mockResolvedValue({ available: false, reason: "NOT_CONFIGURED" });
    const response = await invoke();
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("status", "SUCCEEDED");
  });
});
