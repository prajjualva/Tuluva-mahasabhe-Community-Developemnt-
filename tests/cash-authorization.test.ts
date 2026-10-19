import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ discrepancy: false, approved: false, create: vi.fn() }));
vi.mock("../src/server/payments/payment-integrity", () => ({
  assertDuePayable: vi.fn(),
  assertDueSettlementAllowed: vi.fn(),
  assertNoPendingPaymentForDue: vi.fn(),
  officialReceiptNumber: vi.fn(),
  runSerializablePaymentTransaction: (operation: (tx: unknown) => Promise<unknown>) =>
    operation({
      coordinator: { findFirst: async () => ({ id: "coordinator" }) },
      member: { findUnique: async () => ({ id: "member", coordinatorId: "coordinator" }) },
      payment: { findUnique: async () => null, create: state.create },
      due: { findFirst: async () => ({ id: "due", purpose: "PLAN_REGISTRATION" }) },
      cashCollection: { findMany: async () => [] },
      cashDiscrepancy: { findFirst: async () => (state.discrepancy ? { id: "unresolved" } : null) },
      auditLog: { findFirst: async () => (state.approved ? { id: "approval" } : null) },
    }),
}));
import { collectCashForDue } from "../src/server/coordinators/cash-payment-service";
const command = {
  coordinatorUserId: "user",
  memberExternalId: "member",
  dueExternalId: "due",
  idempotencyKey: "cash-test-command",
};
beforeEach(() => {
  state.discrepancy = false;
  state.approved = false;
  vi.clearAllMocks();
});
it("blocks ₹1,000 cash collection without special Admin approval", async () => {
  await expect(collectCashForDue(command)).rejects.toThrow("Special Admin approval");
  expect(state.create).not.toHaveBeenCalled();
});
it("blocks new collection when the Coordinator has an unresolved discrepancy", async () => {
  state.approved = true;
  state.discrepancy = true;
  await expect(collectCashForDue(command)).rejects.toThrow(
    "Resolve outstanding cash discrepancies",
  );
  expect(state.create).not.toHaveBeenCalled();
});
