import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";

const RETRIABLE_TRANSACTION_CODES = new Set(["P2034", "P2002"]);

type PayableDue = {
  purpose: string;
  status: string;
  dueAt: Date;
};

/**
 * Expired membership and contribution obligations remain payable for
 * reactivation. The time-bound ₹1,000 plan registration does not: an Admin
 * must first extend it, which restores it to PENDING.
 */
export function isDuePayable(due: PayableDue, now = new Date()) {
  if (due.purpose === "PLAN_REGISTRATION")
    return due.status === "PENDING" && due.dueAt.getTime() > now.getTime();
  return ["PENDING", "OVERDUE", "EXPIRED"].includes(due.status);
}

export function assertDuePayable(due: PayableDue, now = new Date()) {
  if (!isDuePayable(due, now)) throw new Error("Due is not payable");
}

/**
 * A provider capture timestamp at or before the ₹1,000 deadline is honored
 * even if the scheduled expiry job ran before its webhook was delivered.
 */
export function assertDueSettlementAllowed(due: PayableDue, settledAt = new Date()) {
  if (due.purpose === "PLAN_REGISTRATION") {
    if (!["PENDING", "EXPIRED"].includes(due.status) || settledAt.getTime() > due.dueAt.getTime())
      throw new Error("Plan registration payment was received after its deadline");
    return;
  }
  if (!["PENDING", "OVERDUE", "EXPIRED"].includes(due.status))
    throw new Error("Due has already been settled");
}

/** A UUID-derived receipt number is unique without exposing database keys. */
export function officialReceiptNumber(paymentExternalId: string, issuedAt = new Date()) {
  return `RCP-${issuedAt.getUTCFullYear()}-${paymentExternalId.replaceAll("-", "").toUpperCase()}`;
}

/**
 * A due may have one unsettled payment attempt at a time. Plan split payments
 * create their wallet and online legs together, so they never call this guard
 * separately for the wallet leg.
 */
export async function assertNoPendingPaymentForDue(
  tx: Prisma.TransactionClient,
  dueId: string,
  idempotencyKey: string,
) {
  const pending = await tx.payment.findFirst({
    where: { dueId, status: "PENDING", NOT: { idempotencyKey } },
    select: { id: true },
  });
  if (pending) throw new Error("A payment for this due is already pending");
}

/**
 * Serializable retries turn a concurrent payable-due check into a durable
 * single-attempt invariant rather than depending on UI timing.
 */
export async function runSerializablePaymentTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        // Wallet split settlement writes several append-only financial records.
        // A pooled production database can take longer than Prisma's default
        // five seconds even though the transaction is healthy.
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        RETRIABLE_TRANSACTION_CODES.has(error.code);
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new Error("Payment operation could not be completed");
}
