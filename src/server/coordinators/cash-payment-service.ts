import { CashStatus, Prisma } from "@prisma/client";
import { advancePlanAfterRegistrationPayment } from "../plans/plan-service";
import {
  assertDuePayable,
  assertNoPendingPaymentForDue,
  officialReceiptNumber,
  runSerializablePaymentTransaction,
} from "../payments/payment-integrity";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";
import { cashReceiptNumber } from "./cash-service";
import { refreshMembershipFinancialStatus } from "../membership/membership-lifecycle-service";
import {
  capturedFundsCanSettleDue,
  flagUnappliedFunds,
} from "../payments/unapplied-payment-service";

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
  method?: "CASH" | "MANUAL";
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
        select: { id: true, coordinatorId: true, userId: true },
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
        if (
          existing.memberId !== member.id ||
          existing.method !== (input.method ?? "CASH") ||
          !matchesDue
        )
          throw new Error("Idempotency key is already in use");
        return existing;
      }
      const due = await tx.due.findFirst({
        where: { externalId: input.dueExternalId, memberId: member.id },
      });
      if (!due) throw new Error("Due is not payable");
      assertDuePayable(due);
      const unresolved = await tx.cashDiscrepancy.findFirst({
        where: {
          status: "UNRESOLVED",
          cashCollectionId: {
            in: (
              await tx.cashCollection.findMany({
                where: { coordinatorId: coordinator.id },
                select: { id: true },
              })
            ).map((item) => item.id),
          },
        },
        select: { id: true },
      });
      if (unresolved)
        throw new Error("Resolve outstanding cash discrepancies before collecting new payments");
      if (due.purpose === "PLAN_REGISTRATION") {
        const approval = await tx.auditLog.findFirst({
          where: {
            action: "PLAN_CASH_COLLECTION_APPROVED",
            entityType: "Due",
            entityId: due.id,
          },
          select: { id: true },
        });
        if (!approval)
          throw new Error("Special Admin approval is required to collect the ₹1,000 plan payment");
      }
      const priorCollections = await tx.cashCollection.findMany({
        where: { dueId: due.id },
        select: { status: true },
      });
      if (!canCreateCashCollectionForDue(priorCollections.map((collection) => collection.status)))
        throw new Error("A Coordinator payment is already open or settled for this due");
      await assertNoPendingPaymentForDue(tx, due.id, input.idempotencyKey);
      const payment = await tx.payment.create({
        data: {
          memberId: member.id,
          dueId: due.id,
          amountPaise: due.amountPaise,
          method: input.method ?? "CASH",
          idempotencyKey: input.idempotencyKey,
        },
      });
      const counter = await tx.cashReceiptCounter.upsert({
        where: { year: new Date().getUTCFullYear() },
        create: { year: new Date().getUTCFullYear(), value: 1 },
        update: { value: { increment: 1 } },
      });
      const receiptNumber = cashReceiptNumber(counter.value).replace(
        "CASH-",
        `${input.method ?? "CASH"}-`,
      );
      const collection = await tx.cashCollection.create({
        data: {
          coordinatorId: coordinator.id,
          memberId: member.id,
          dueId: due.id,
          paymentId: payment.id,
          amountPaise: due.amountPaise,
          method: input.method ?? "CASH",
          receiptNumber,
          status: "RECEIVED_BY_COORDINATOR",
        },
      });
      await tx.receipt.create({ data: { paymentId: payment.id, receiptNumber } });
      await tx.auditLog.create({
        data: {
          actorId: input.coordinatorUserId,
          action: "COORDINATOR_PAYMENT_RECORDED",
          entityType: "CashCollection",
          entityId: collection.id,
          afterState: {
            amountPaise: due.amountPaise,
            dueExternalId: due.externalId,
            method: input.method ?? "CASH",
          },
        },
      });
      await createInAppNotificationInTransaction(tx, {
        userId: member.userId,
        type: "CASH_COLLECTION",
        title: "Coordinator payment recorded",
        body: "Your Coordinator recorded a cash/manual Foundation payment. It is awaiting Foundation Admin verification before it is treated as paid.",
        template: "CASH_COLLECTION_RECORDED",
        relatedExternalId: payment.externalId,
        payload: { dueExternalId: due.externalId, collectionExternalId: collection.externalId },
        idempotencyKey: `cash-collection:${collection.id}:recorded`,
      });
      return payment;
    });
  } catch (error) {
    // The partial unique index is the final race-safe guard when two
    // Coordinators attempt recollection at the same time.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new Error("A Coordinator payment is already open or settled for this due");
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
  return runSerializablePaymentTransaction((tx) =>
    verifyCashCollectionInTransaction(tx, externalCollectionId, adminUserId, approved, reason),
  );
}

export async function verifyCashCollectionInTransaction(
  tx: Prisma.TransactionClient,
  externalCollectionId: string,
  adminUserId: string,
  approved: boolean,
  reason?: string,
) {
  const collection = await tx.cashCollection.findUnique({
    where: { externalId: externalCollectionId },
    include: { member: { select: { userId: true } } },
  });
  if (
    !collection ||
    !["RECEIVED_BY_COORDINATOR", "PENDING_ADMIN_VERIFICATION"].includes(collection.status)
  )
    throw new Error("Coordinator payment is not awaiting verification");
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: collection.paymentId } });
  if (!approved && (await tx.cashDiscrepancy.count({ where: { cashCollectionId: collection.id } })))
    throw new Error("A collection with a discrepancy must be reconciled, not rejected");
  const allocations = await tx.cashDepositAllocation.findMany({
    where: {
      cashCollectionId: collection.id,
      deposit: { status: { in: ["PENDING", "VERIFIED"] } },
    },
    include: { deposit: { select: { status: true } } },
  });
  const verifiedAmount = allocations
    .filter((item) => item.deposit.status === "VERIFIED")
    .reduce((sum, item) => sum + (item.receivedAmountPaise ?? 0), 0);
  if (approved && verifiedAmount !== collection.amountPaise)
    throw new Error("Verify remittance evidence covering this collection first");
  if (
    !approved &&
    (verifiedAmount > 0 || allocations.some((item) => item.deposit.status === "PENDING"))
  )
    throw new Error("A remitted collection cannot be rejected; reconcile its deposit");
  if (approved) {
    if (payment.status !== "PENDING") throw new Error("Coordinator payment is not pending");
    const due = await tx.due.findUniqueOrThrow({ where: { id: collection.dueId } });
    const appliedToDue = capturedFundsCanSettleDue(due, collection.createdAt);
    if (appliedToDue) {
      const claimed = await tx.due.updateMany({
        where: {
          id: due.id,
          status: { in: ["PENDING", "OVERDUE", "EXPIRED"] },
        },
        data: { status: "PAID", paidAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("Due has already been settled");
    } else {
      await flagUnappliedFunds(tx, payment, due, adminUserId);
    }
    await tx.cashCollection.update({ where: { id: collection.id }, data: { status: "PAID" } });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCEEDED", providerReference: collection.externalId },
    });
    if (appliedToDue && due.purpose === "PLAN_REGISTRATION" && due.planId)
      await advancePlanAfterRegistrationPayment(tx, due.planId);
    if (appliedToDue && due.purpose === "MEMBERSHIP")
      await refreshMembershipFinancialStatus(tx, collection.memberId);
    const receipt = await tx.receipt.upsert({
      where: { paymentId: payment.id },
      update: {},
      create: { paymentId: payment.id, receiptNumber: officialReceiptNumber(payment.externalId) },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: collection.member.userId,
      type: "CASH_COLLECTION",
      title: "Coordinator payment verified",
      body: `Your Coordinator payment was verified by the Foundation. Receipt ${receipt.receiptNumber} is available in your member portal.`,
      template: "CASH_COLLECTION_VERIFIED",
      relatedExternalId: payment.externalId,
      payload: {
        receiptNumber: receipt.receiptNumber,
        collectionExternalId: collection.externalId,
      },
      idempotencyKey: `cash-collection:${collection.id}:verified`,
    });
    await createInAppNotificationInTransaction(tx, {
      userId: collection.member.userId,
      type: "PAYMENT_SUCCEEDED",
      title: "Payment received",
      body: appliedToDue
        ? `Your Foundation payment has been verified. Receipt ${receipt.receiptNumber} is available in your member portal.`
        : "Your cash remittance was verified, but the obligation is no longer payable. Admin has been notified for refund review; no membership or plan was activated.",
      template: "PAYMENT_SETTLED",
      relatedExternalId: payment.externalId,
      payload: { receiptNumber: receipt.receiptNumber, duePurpose: due.purpose },
      idempotencyKey: `payment:${payment.id}:succeeded`,
    });
    await createInAppNotificationInTransaction(tx, {
      userId: collection.member.userId,
      type: "RECEIPT_GENERATED",
      title: "Official receipt generated",
      body: `Official receipt ${receipt.receiptNumber} is ready for your Foundation payment.`,
      template: "RECEIPT_GENERATED",
      relatedExternalId: payment.externalId,
      payload: { receiptNumber: receipt.receiptNumber },
      idempotencyKey: `receipt:${receipt.id}:generated`,
    });
  } else {
    await tx.cashCollection.update({
      where: { id: collection.id },
      data: { status: "REJECTED" },
    });
    await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    await createInAppNotificationInTransaction(tx, {
      userId: collection.member.userId,
      type: "CASH_DISCREPANCY",
      title: "Coordinator payment needs attention",
      body: "A Coordinator cash/manual payment could not be verified. No successful Foundation payment was recorded; please contact the Foundation or Coordinator.",
      template: "CASH_COLLECTION_REJECTED",
      relatedExternalId: payment.externalId,
      idempotencyKey: `cash-collection:${collection.id}:rejected`,
    });
    await createInAppNotificationInTransaction(tx, {
      userId: collection.member.userId,
      type: "PAYMENT_FAILED",
      title: "Payment was not completed",
      body: "Your Coordinator cash/manual payment was not verified. You can arrange a new payment after the issue is resolved.",
      template: "PAYMENT_FAILED",
      relatedExternalId: payment.externalId,
      idempotencyKey: `payment:${payment.id}:failed`,
    });
  }
  await tx.auditLog.create({
    data: {
      actorId: adminUserId,
      action: approved ? "COORDINATOR_PAYMENT_VERIFIED" : "COORDINATOR_PAYMENT_REJECTED",
      entityType: "CashCollection",
      entityId: collection.id,
      reason: reason?.trim(),
    },
  });
  return { externalId: collection.externalId, status: approved ? "PAID" : "REJECTED" };
}
