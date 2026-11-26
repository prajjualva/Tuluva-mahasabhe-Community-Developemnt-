import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  find: vi.fn(),
  capture: vi.fn(),
  settle: vi.fn(),
  audit: vi.fn(),
  provider: vi.fn(),
}));
vi.mock("../src/server/database/prisma", () => ({ prisma: { payment: { findFirst: m.find } } }));
vi.mock("../src/server/payments/payment-provider", () => ({ getPaymentProvider: m.provider }));
vi.mock("../src/server/payments/payment-service", () => ({ settlePaymentInTransaction: m.settle }));
vi.mock("../src/server/payments/payment-integrity", () => ({
  runSerializablePaymentTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ auditLog: { create: m.audit } }),
}));
import { reconcileOwnedOnlinePayment } from "../src/server/payments/payment-reconciliation-service";
describe("owned payment reconciliation", () => {
  const externalId = "26aa1363-c133-4c33-b30e-1458e324a90f";
  const payment = {
    id: "private-db-id",
    externalId,
    status: "PENDING",
    providerOrderId: "order_owned",
    amountPaise: 36900,
    receipt: null,
    refund: null,
  };
  const capture = {
    providerOrderId: payment.providerOrderId,
    providerReference: "pay_verified",
    amountPaise: 36900,
    currency: "INR",
    verifiedAt: new Date(),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    m.find.mockResolvedValue(payment);
    m.provider.mockReturnValue({
      available: true,
      provider: { findCapturedOrderPayment: m.capture },
    });
    m.capture.mockResolvedValue(capture);
    m.settle.mockResolvedValue({
      payment: { status: "SUCCEEDED" },
      receipt: { receiptNumber: "RCP-UNIT" },
      alreadySettled: false,
    });
  });
  it("checks ownership before fetching provider data or changing finances", async () => {
    m.find.mockResolvedValue(null);
    await expect(reconcileOwnedOnlinePayment("owner", externalId, "owner")).rejects.toThrow(
      "not found",
    );
    expect(m.find.mock.calls[0][0].where).toEqual({
      externalId,
      member: { userId: "owner" },
      method: "ONLINE",
    });
    expect(m.capture).not.toHaveBeenCalled();
    expect(m.settle).not.toHaveBeenCalled();
  });
  it("records verified funds and their audit atomically, without exposing database IDs", async () => {
    const result = await reconcileOwnedOnlinePayment("owner", externalId, "owner");
    expect(result).toEqual({ status: "SUCCEEDED", receiptNumber: "RCP-UNIT" });
    expect(m.capture).toHaveBeenCalledWith("order_owned", 36900);
    expect(m.settle.mock.calls[0].slice(1)).toEqual([
      payment.id,
      "owner",
      "pay_verified",
      capture.verifiedAt,
    ]);
    expect(m.audit.mock.calls[0][0].data.action).toBe("PAYMENT_PROVIDER_RECONCILED");
    expect(JSON.stringify(result)).not.toContain(payment.id);
  });
  it("does not settle pending authorizations or failed provider fetches", async () => {
    m.capture.mockResolvedValue(null);
    expect((await reconcileOwnedOnlinePayment("owner", externalId)).status).toBe("PENDING");
    expect(m.settle).not.toHaveBeenCalled();
    m.capture.mockRejectedValue(new Error("unavailable"));
    await expect(reconcileOwnedOnlinePayment("owner", externalId)).rejects.toThrow();
    expect(m.settle).not.toHaveBeenCalled();
  });
  it("rejects mismatched evidence before settlement", async () => {
    for (const different of [
      { ...capture, providerOrderId: "order_other" },
      { ...capture, amountPaise: 100 },
      { ...capture, currency: "USD" },
    ]) {
      m.capture.mockResolvedValue(different);
      await expect(reconcileOwnedOnlinePayment("owner", externalId)).rejects.toThrow(
        "does not match",
      );
    }
    expect(m.settle).not.toHaveBeenCalled();
  });
  it("replays settled payments without another provider request, receipt or audit", async () => {
    m.find.mockResolvedValue({
      ...payment,
      status: "SUCCEEDED",
      receipt: { receiptNumber: "RCP-EXISTING" },
    });
    expect(await reconcileOwnedOnlinePayment("owner", externalId)).toEqual({
      status: "SUCCEEDED",
      receiptNumber: "RCP-EXISTING",
    });
    expect(m.capture).not.toHaveBeenCalled();
    expect(m.settle).not.toHaveBeenCalled();
  });
  it("does not describe a refunded payment as successful", async () => {
    m.find.mockResolvedValue({ ...payment, status: "SUCCEEDED", refund: { status: "SUCCEEDED" } });
    expect((await reconcileOwnedOnlinePayment("owner", externalId)).status).toBe("REFUNDED");
    expect(m.capture).not.toHaveBeenCalled();
  });
});
