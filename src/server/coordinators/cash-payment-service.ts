import { prisma } from "../database/prisma";
import { advancePlanAfterRegistrationPayment } from "../plans/plan-service";

const cashReceiptNumber = (externalId: string) =>
  `CASH-${new Date().getUTCFullYear()}-${externalId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
const receiptNumber = (externalId: string) =>
  `RCP-${new Date().getUTCFullYear()}-${externalId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;

export async function collectCashForDue(input: {
  coordinatorUserId: string;
  memberExternalId: string;
  dueExternalId: string;
  idempotencyKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    const coordinator = await tx.coordinator.findFirst({
      where: { member: { userId: input.coordinatorUserId }, isSuspended: false, status: "ACTIVE" },
      select: { id: true },
    });
    if (!coordinator) throw new Error("Active Coordinator profile is required");
    const member = await tx.member.findUnique({
      where: { externalId: input.memberExternalId },
      select: { id: true, coordinatorId: true },
    });
    if (!member || member.coordinatorId !== coordinator.id)
      throw new Error("Member is not assigned to this Coordinator");
    const due = await tx.due.findFirst({
      where: {
        externalId: input.dueExternalId,
        memberId: member.id,
        status: { in: ["PENDING", "OVERDUE", "EXPIRED"] },
      },
    });
    if (!due) throw new Error("Due is not payable");
    const existing = await tx.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { receipt: true },
    });
    if (existing) {
      if (existing.memberId !== member.id || existing.dueId !== due.id)
        throw new Error("Idempotency key is already in use");
      return existing;
    }
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
}

export async function verifyCashCollection(
  externalCollectionId: string,
  adminUserId: string,
  approved: boolean,
  reason?: string,
) {
  if (!approved && !reason?.trim()) throw new Error("A rejection reason is required");
  return prisma.$transaction(async (tx) => {
    const collection = await tx.cashCollection.findUnique({
      where: { externalId: externalCollectionId },
    });
    if (!collection || collection.status !== "PENDING_ADMIN_VERIFICATION")
      throw new Error("Cash collection is not awaiting verification");
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: collection.paymentId } });
    if (approved) {
      await tx.cashCollection.update({ where: { id: collection.id }, data: { status: "PAID" } });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "SUCCEEDED", providerReference: collection.externalId },
      });
      const due = await tx.due.update({
        where: { id: collection.dueId },
        data: { status: "PAID", paidAt: new Date() },
      });
      if (due.purpose === "PLAN_REGISTRATION" && due.planId)
        await advancePlanAfterRegistrationPayment(tx, due.planId);
      await tx.receipt.create({
        data: { paymentId: payment.id, receiptNumber: receiptNumber(payment.externalId) },
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
