import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ roles: vi.fn(), receipt: vi.fn(), audit: vi.fn() }));
vi.mock("../src/server/payments/payment-integrity", () => ({
  runSerializablePaymentTransaction: (operation: (tx: unknown) => unknown) =>
    operation({
      userRole: { count: mocks.roles },
      receipt: { findUnique: mocks.receipt },
      auditLog: { create: mocks.audit },
    }),
}));
import { downloadAdministrativeReceipt } from "../src/server/admin/admin-receipt-service";
describe("Admin receipt access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.roles.mockResolvedValue(1);
    mocks.receipt.mockResolvedValue({
      receiptNumber: "CASH-2026-000001",
      issuedAt: new Date(),
      payment: {
        id: "internal-payment",
        externalId: "public-payment",
        amountPaise: 10000,
        method: "CASH",
        status: "SUCCEEDED",
        providerReference: "verified-reference",
        member: { externalId: "public-member", fullName: "Synthetic member" },
        due: { externalId: "public-due", purpose: "CONTRIBUTION" },
        refund: { status: "SUCCEEDED" },
      },
    });
  });
  it("requires a live administrative assignment before reading records", async () => {
    mocks.roles.mockResolvedValue(0);
    await expect(downloadAdministrativeReceipt("non-admin", "CASH-2026-000001")).rejects.toThrow(
      "Forbidden",
    );
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it("retains truthful refund status and audits the inspecting identity", async () => {
    const result = await downloadAdministrativeReceipt("admin", "CASH-2026-000001");
    expect(result.html).toContain("REFUNDED");
    expect(result.html).not.toContain("internal-payment");
    expect(mocks.audit.mock.calls[0][0].data).toMatchObject({
      actorId: "admin",
      action: "ADMIN_RECEIPT_DOWNLOADED",
      entityId: "internal-payment",
    });
  });
  it("rejects unsafe receipt filenames before querying", async () => {
    await expect(downloadAdministrativeReceipt("admin", "../private\r\nheader")).rejects.toThrow();
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it("does not issue a document when a receipt does not exist", async () => {
    mocks.receipt.mockResolvedValue(null);
    await expect(downloadAdministrativeReceipt("admin", "RCP-MISSING")).rejects.toThrow(
      "not found",
    );
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
