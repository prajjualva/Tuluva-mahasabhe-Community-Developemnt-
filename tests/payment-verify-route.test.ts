import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({
  authorize: vi.fn(),
  reconcile: vi.fn(),
  rate: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("../src/server/http/authorize", () => ({ requireApiPermission: m.authorize }));
vi.mock("../src/server/payments/payment-reconciliation-service", () => ({
  reconcileOwnedOnlinePayment: m.reconcile,
}));
vi.mock("../src/server/notifications/notification-delivery-service", () => ({
  scheduleNotificationDelivery: m.schedule,
}));
vi.mock("../src/server/security/rate-limit", () => ({
  consumeRateLimit: m.rate,
  privateRateLimitKey: (...v: string[]) => v.join(":"),
}));
import { POST } from "../src/app/api/member/payments/[paymentId]/verify/route";
describe("payment confirmation API", () => {
  const id = "5ad8881c-1466-47a9-a0f7-b810d84137ad";
  const invoke = (paymentId = id) =>
    POST(
      new NextRequest(`https://foundation.example/api/member/payments/${paymentId}/verify`, {
        method: "POST",
        body: JSON.stringify({ amountPaise: 1, status: "SUCCEEDED", memberId: "another-member" }),
      }),
      { params: Promise.resolve({ paymentId }) },
    );
  beforeEach(() => {
    vi.clearAllMocks();
    m.authorize.mockResolvedValue({ userId: "signed-in-owner" });
    m.reconcile.mockResolvedValue({ status: "PENDING", receiptNumber: null });
  });
  it("ignores browser-selected money/status/owner and checks the authenticated member only", async () => {
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(m.authorize.mock.calls[0][1]).toBe("member:profile:write");
    expect(m.reconcile).toHaveBeenCalledWith("signed-in-owner", id, "signed-in-owner");
    expect(m.schedule).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and cross-member access without claiming success", async () => {
    m.authorize.mockRejectedValueOnce(new Error("not signed in"));
    expect((await invoke()).status).toBe(403);
    expect(m.reconcile).not.toHaveBeenCalled();
    m.reconcile.mockRejectedValueOnce(new Error("Payment not found"));
    expect((await invoke()).status).toBe(403);
    expect(m.schedule).not.toHaveBeenCalled();
  });
  it("queues receipt notifications only after confirmed settlement", async () => {
    m.reconcile.mockResolvedValue({ status: "SUCCEEDED", receiptNumber: "RCP-UNIT" });
    expect((await (await invoke()).json()).receiptNumber).toBe("RCP-UNIT");
    expect(m.schedule).toHaveBeenCalledWith({ userId: "signed-in-owner", limit: 10 });
  });
  it("rejects non-UUID references before contacting the provider", async () => {
    expect((await invoke("private-db-id")).status).toBe(403);
    expect(m.reconcile).not.toHaveBeenCalled();
  });
});
