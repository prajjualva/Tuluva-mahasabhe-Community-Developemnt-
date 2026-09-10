import { CashStatus, Prisma } from "@prisma/client";
import { advancePlanAfterRegistrationPayment } from "../plans/plan-service";
import {
  assertDuePayable,
  assertDueSettlementAllowed,
  assertNoPendingPaymentForDue,
  officialReceiptNumber,
  runSerializablePaymentTransaction,
} from "../payments/payment-integrity";

const cashReceiptNumber = (externalId: string) =>
  `CASH-${new Date().getUTCFullYear()}-${externalId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
/**
 * A failed collection is historical evidence, not a reason to permanently
 * prevent the member from paying again. Every other collection state blocks a
 * new attempt for the same due so that there can be only one open or settled
 * cash collection at a time.
 */
export function canCreateCashCollectionForDue(priorStatuses: readonly CashStatus[]) {
  return priorStatuses.every((status) => status === "REJECTED");
}

export async function collectCashForDue(input: {
  coordinatorUserId: string;
  memberExternalId: string;
  dueExternalId: string;
  idempotencyKey: string;
}) {
  try {
    return await runSerializablePaymentTransaction(async (tx) => {
      const coordinator = await tx.coordinator.findFirst({
        where: {
          member: { userId: input.coordinatorUserId },
          isSuspended: false,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!coordinator) throw new Error("Active Coordinator profile is required");
      const member = await tx.member.findUnique({
        where: { externalId: input.memberExternalId },
        select: { id: true, coordinatorId: true },
      });
      if (!member || member.coordinatorId !== coordinator.id)
        throw new Error("Member is not assigned to this Coordinator");
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { receipt: true },
      });
      if (existing) {
        const matchesDue = await tx.due.findFirst({
          where: { id: existing.dueId ?? "", externalId: input.dueExternalId },
          select: { id: true },
        });
        if (existing.memberId !== member.id || existing.method !== "CASH" || !matchesDue)
          throw new Error("Idempotency key is already in use");
        return existing;
      }
      const due = await tx.due.findFirst({
        where: { externalId: input.dueExternalId, memberId: member.id },
      });
      if (!due) throw new Error("Due is not payable");
      assertDuePayable(due);
      const priorCollections = await tx.cashCollection.findMany({
        where: { dueId: due.id },
        select: { status: true },
      });
      if (!canCreateCashCollectionForDue(priorCollections.map((collection) => collection.status)))
        throw new Error("A cash collection is already open or settled for this due");
      await assertNoPendingPaymentForDue(tx, due.id, input.idempotencyKey);
      const payment = await tx.payment.create({
        data: {
          memberId: member.id,
          dueId: due.id,
          amountPaise: due.amountPaise,
          method: "CASH",
          idempotencyKey: input.idempotencyKey,
        },
      });
      const collection = await tx.cashCollection.create({
        data: {
          coordinatorId: coordinator.id,
          memberId: member.id,
          dueId: due.id,
          paymentId: payment.id,
          amountPaise: due.amountPaise,
          receiptNumber: cashReceiptNumber(payment.externalId),
          status: "PENDING_ADMIN_VERIFICATION",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.coordinatorUserId,
          action: "CASH_COLLECTION_RECORDED",
          entityType: "CashCollection",
          entityId: collection.id,
          afterState: { amountPaise: due.amountPaise, dueExternalId: due.externalId },
        },
      });
      return payment;
    });
  } catch (error) {
    // The partial unique index is the final race-safe guard when two
    // Coordinators attempt recollection at the same time.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new Error("A cash collection is already open or settled for this due");
    throw error;
  }
}

export async function verifyCashCollection(
  externalCollectionId: string,
  adminUserId: string,
  approved: boolean,
  reason?: string,
) {
  if (!approved && !reason?.trim()) throw new Error("A rejection reason is required");
  return runSerializablePaymentTransaction(async (tx) => {
    const collection = await tx.cashCollection.findUnique({
      where: { externalId: externalCollectionId },
    });
    if (!collection || collection.status !== "PENDING_ADMIN_VERIFICATION")
      throw new Error("Cash collection is not awaiting verification");
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: collection.paymentId } });
    if (approved) {
      if (payment.status !== "PENDING") throw new Error("Cash payment is not pending");
      const due = await tx.due.findUniqueOrThrow({ where: { id: collection.dueId } });
      assertDueSettlementAllowed(due);
      const claimed = await tx.due.updateMany({
        where: {
          id: due.id,
          status: { in: ["PENDING", "OVERDUE", "EXPIRED"] },
        },
        data: { status: "PAID", paidAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("Due has already been settled");
      await tx.cashCollection.update({ where: { id: collection.id }, data: { status: "PAID" } });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "SUCCEEDED", providerReference: collection.externalId },
      });
      if (due.purpose === "PLAN_REGISTRATION" && due.planId)
        await advancePlanAfterRegistrationPayment(tx, due.planId);
      await tx.receipt.create({
        data: { paymentId: payment.id, receiptNumber: officialReceiptNumber(payment.externalId) },
      });
      await tx.foundationLedger.create({
        data: {
          direction: "CREDIT",
          amountPaise: payment.amountPaise,
          purpose: due.purpose,
          relatedExternalId: payment.externalId,
          authorizedActorId: adminUserId,
          status: "SUCCEEDED",
        },
      });
    } else {
      await tx.cashCollection.update({
        where: { id: collection.id },
        data: { status: "REJECTED" },
      });
      await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    }
    await tx.auditLog.create({
      data: {
        actorId: adminUserId,
        action: approved ? "CASH_COLLECTION_VERIFIED" : "CASH_COLLECTION_REJECTED",
        entityType: "CashCollection",
        entityId: collection.id,
        reason: reason?.trim(),
      },
    });
    return { externalId: collection.externalId, status: approved ? "PAID" : "REJECTED" };
  });
}
