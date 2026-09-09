import { assertPositiveMoney } from "../../domain/money";
export function cashReceiptNumber(sequence: number, date = new Date()) {
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error("Receipt sequence is invalid");
  return `CASH-${date.getUTCFullYear()}-${String(sequence).padStart(6, "0")}`;
}
export function createCashCollection(input: {
  amountPaise: number;
  purpose: "CONTRIBUTION" | "MEMBERSHIP" | "PLAN";
  hasPlanApproval?: boolean;
  unresolvedDiscrepancy: boolean;
  sequence: number;
}) {
  if (input.unresolvedDiscrepancy)
    throw new Error("Unresolved cash discrepancy prevents collection");
  assertPositiveMoney(input.amountPaise);
  if (input.purpose === "PLAN" && !input.hasPlanApproval)
    throw new Error("Plan cash collection needs Admin approval");
  return {
    status: "RECEIVED_BY_COORDINATOR" as const,
    nextStatus: "PENDING_ADMIN_VERIFICATION" as const,
    receiptNumber: cashReceiptNumber(input.sequence),
  };
}
