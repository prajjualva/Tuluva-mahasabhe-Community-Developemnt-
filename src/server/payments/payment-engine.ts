import { MONEY } from "../../domain/money";
export type PaymentSplit = { walletPaise: number; onlinePaise: number };
export function allocateWalletPayment(
  walletBalancePaise: number,
  amountPaise: number,
  allowCombined = false,
): PaymentSplit {
  if (walletBalancePaise >= amountPaise) return { walletPaise: amountPaise, onlinePaise: 0 };
  return allowCombined
    ? { walletPaise: walletBalancePaise, onlinePaise: amountPaise - walletBalancePaise }
    : { walletPaise: 0, onlinePaise: amountPaise };
}
export function receiptNumber(sequence: number, year = new Date().getUTCFullYear()) {
  return `RCP-${year}-${String(sequence).padStart(6, "0")}`;
}
export function planRegistrationDue(now = new Date()) {
  return {
    amountPaise: MONEY.planRegistration,
    dueAt: new Date(now.getTime() + 30 * 86400000),
    status: "PENDING" as const,
  };
}

export function applyPaymentOutcome(
  current: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED",
  outcome: "SUCCEEDED" | "FAILED" | "CANCELLED",
) {
  if (current !== "PENDING") throw new Error("Payment outcome is immutable once settled");
  return outcome;
}

export function planStatusAfterPayment(
  paymentStatus: "SUCCEEDED" | "FAILED",
  requiresCoordinatorApproval: boolean,
  requiresAdminApproval: boolean,
) {
  if (paymentStatus === "FAILED") return "PAYMENT_PENDING" as const;
  if (requiresCoordinatorApproval) return "PENDING_COORDINATOR_APPROVAL" as const;
  if (requiresAdminApproval) return "PENDING_ADMIN_APPROVAL" as const;
  return "ACTIVE" as const;
}

export function extendPlanDueByAdmin(currentDueAt: Date, newDueAt: Date, reason: string) {
  if (!reason.trim() || newDueAt <= currentDueAt)
    throw new Error("Admin extension needs a reason and later expiry");
  return { dueAt: newDueAt, reason, audited: true };
}
