import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { advancePlanAfterRegistrationPayment } from "../plans/plan-service";

const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const receiptNumber = (paymentExternalId: string) =>
  `RCP-${new Date().getUTCFullYear()}-${paymentExternalId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;

export async function memberIdForUser(userId: string) {
  const member = await prisma.member.findUnique({ where: { userId } });
  if (!member) throw new Error("Member account is required");
  return member.id;
}

/** Resolves an API-safe due UUID while retaining internal keys inside services. */
export async function dueIdForMemberExternal(memberId: string, externalDueId: string) {
  const due = await prisma.due.findFirst({
    where: { memberId, externalId: externalDueId },
    select: { id: true },
  });
  if (!due) throw new Error("Due not found");
  return due.id;
}

/** Server-side command: never accepts an amount selected by the browser. */
export async function createPaymentCommand(input: {
  memberId: string;
  dueId: string;
  method: "ONLINE" | "WALLET" | "CASH" | "MANUAL";
  idempotencyKey: string;
  actorId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const due = await tx.due.findUnique({ where: { id: input.dueId } });
    if (
      !due ||
      due.memberId !== input.memberId ||
      !["PENDING", "OVERDUE", "EXPIRED"].includes(due.status)
    )
      throw new Error("Due is not payable");
    const existing = await tx.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { receipt: true },
    });
    if (existing) return existing;
    const payment = await tx.payment.create({
      data: {
        memberId: input.memberId,
        dueId: input.dueId,
        amountPaise: due.amountPaise,
        method: input.method,
        idempotencyKey: input.idempotencyKey,
        status: "PENDING",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "PAYMENT_INITIATED",
        entityType: "Payment",
        entityId: payment.id,
      },
    });
    return payment;
  });
}

export async function recordWebhook(provider: string, eventId: string, payload: unknown) {
  const existing = await prisma.paymentWebhook.findUnique({
    where: { provider_providerEventId: { provider, providerEventId: eventId } },
    select: { processedAt: true },
  });
  if (existing) return { shouldProcess: !existing.processedAt };
  try {
    await prisma.paymentWebhook.create({
      data: { provider, providerEventId: eventId, payload: payload as Prisma.InputJsonValue },
    });
    return { shouldProcess: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return { shouldProcess: false };
    throw error;
  }
}

export async function completeWebhook(provider: string, eventId: string) {
  await prisma.paymentWebhook.update({
    where: { provider_providerEventId: { provider, providerEventId: eventId } },
    data: { processedAt: new Date() },
  });
}

export async function settlePayment(
  paymentId: string,
  actorId: string | undefined,
  providerReference: string,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { receipt: true, due: true },
    });
    if (!existing) throw new Error("Payment not found");
    if (existing.status === "SUCCEEDED")
      return { payment: existing, receipt: existing.receipt, alreadySettled: true };
    if (existing.status !== "PENDING") throw new Error("Payment is not pending");
    const payment = await tx.payment.update({
      where: { id: paymentId },
      data: { status: "SUCCEEDED", providerReference },
    });
    if (existing.due) {
      await tx.due.update({
        where: { id: existing.due.id },
        data: { status: "PAID", paidAt: new Date() },
      });
      if (existing.due.purpose === "PLAN_REGISTRATION" && existing.due.planId)
        await advancePlanAfterRegistrationPayment(tx, existing.due.planId);
    }
    const receipt = await tx.receipt.create({
      data: {
        paymentId,
        receiptNumber: receiptNumber(payment.externalId),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        actorRole: actorId ? undefined : "SYSTEM",
        action: "PAYMENT_SETTLED",
        entityType: "Payment",
        entityId: payment.id,
      },
    });
    return { payment, receipt, alreadySettled: false };
  });
}

export async function failPayment(paymentId: string, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status === "FAILED") return payment;
    if (payment.status !== "PENDING") throw new Error("Payment outcome is immutable");
    const failed = await tx.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        actorRole: actorId ? undefined : "SYSTEM",
        action: "PAYMENT_FAILED",
        entityType: "Payment",
        entityId: payment.id,
      },
    });
    return failed;
  });
}
export const opaquePaymentReference = (reference: string) => tokenHash(reference);
