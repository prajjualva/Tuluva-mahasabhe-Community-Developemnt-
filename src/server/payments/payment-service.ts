import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { advancePlanAfterRegistrationPayment } from "../plans/plan-service";
import {
  assertDuePayable,
  assertDueSettlementAllowed,
  assertNoPendingPaymentForDue,
  officialReceiptNumber,
  runSerializablePaymentTransaction,
} from "./payment-integrity";

const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

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
  return runSerializablePaymentTransaction(async (tx) => {
    const existing = await tx.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { receipt: true },
    });
    if (existing) {
      if (
        existing.memberId !== input.memberId ||
        existing.dueId !== input.dueId ||
        existing.method !== input.method
      )
        throw new Error("Idempotency key is already in use");
      return existing;
    }
    const due = await tx.due.findUnique({ where: { id: input.dueId } });
    if (!due || due.memberId !== input.memberId) throw new Error("Due is not payable");
    assertDuePayable(due);
    await assertNoPendingPaymentForDue(tx, due.id, input.idempotencyKey);
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
  settledAt = new Date(),
) {
  return runSerializablePaymentTransaction(async (tx) => {
    const existing = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { receipt: true, due: true },
    });
    if (!existing) throw new Error("Payment not found");
    if (existing.status === "SUCCEEDED")
      return { payment: existing, receipt: existing.receipt, alreadySettled: true };
    if (existing.status !== "PENDING") throw new Error("Payment is not pending");

    if (existing.due) {
      assertDueSettlementAllowed(existing.due, settledAt);
      const claimed = await tx.due.updateMany({
        where: {
          id: existing.due.id,
          status: { in: ["PENDING", "OVERDUE", "EXPIRED"] },
        },
        data: { status: "PAID", paidAt: settledAt },
      });
      if (claimed.count !== 1) throw new Error("Due has already been settled");
    }
    const payment = await tx.payment.update({
      where: { id: paymentId },
      data: { status: "SUCCEEDED", providerReference },
    });
    if (existing.due) {
      if (existing.due.purpose === "PLAN_REGISTRATION" && existing.due.planId)
        await advancePlanAfterRegistrationPayment(tx, existing.due.planId);
    }
    const receipt = await tx.receipt.create({
      data: {
        paymentId,
        receiptNumber: officialReceiptNumber(payment.externalId),
      },
    });
    await tx.foundationLedger.create({
      data: {
        direction: "CREDIT",
        amountPaise: payment.amountPaise,
        purpose: existing.due?.purpose ?? "PAYMENT",
        relatedExternalId: payment.externalId,
        authorizedActorId: actorId,
        status: "SUCCEEDED",
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
  return runSerializablePaymentTransaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { due: true },
    });
    if (payment.status === "FAILED") return payment;
    if (payment.status !== "PENDING") throw new Error("Payment outcome is immutable");
    const failed = await tx.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    // A partial plan wallet leg has already been settled when the real gateway
    // order is made. A verified provider failure appends a compensating wallet
    // credit and ledger debit so a new checkout can never charge that balance
    // twice. The original receipt remains immutable evidence of the first leg.
    if (
      payment.method === "ONLINE" &&
      payment.due?.purpose === "PLAN_REGISTRATION" &&
      payment.memberId
    ) {
      const walletPayment = await tx.payment.findUnique({
        where: { idempotencyKey: `${payment.idempotencyKey}:wallet` },
      });
      if (
        walletPayment &&
        walletPayment.status === "SUCCEEDED" &&
        walletPayment.memberId === payment.memberId &&
        walletPayment.dueId === payment.dueId
      ) {
        const wallet = await tx.wallet.findUnique({ where: { memberId: payment.memberId } });
        if (!wallet) throw new Error("Wallet compensation could not be applied");
        const priorCompensation = await tx.walletTransaction.findFirst({
          where: {
            walletId: wallet.id,
            direction: "CREDIT",
            purpose: "PLAN_REGISTRATION_WALLET_REFUND",
            relatedExternalId: walletPayment.externalId,
          },
          select: { id: true },
        });
        if (!priorCompensation) {
          const changed = await tx.wallet.updateMany({
            where: { id: wallet.id, version: wallet.version },
            data: {
              balancePaise: { increment: walletPayment.amountPaise },
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) throw new Error("Wallet balance changed; retry payment");
          const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              direction: "CREDIT",
              amountPaise: walletPayment.amountPaise,
              balanceAfterPaise: updated.balancePaise,
              purpose: "PLAN_REGISTRATION_WALLET_REFUND",
              relatedExternalId: walletPayment.externalId,
            },
          });
          await tx.foundationLedger.create({
            data: {
              direction: "DEBIT",
              amountPaise: walletPayment.amountPaise,
              purpose: "PLAN_REGISTRATION_WALLET_REFUND",
              relatedExternalId: walletPayment.externalId,
              authorizedActorId: actorId,
              status: "SUCCEEDED",
            },
          });
          await tx.auditLog.create({
            data: {
              actorId,
              actorRole: actorId ? undefined : "SYSTEM",
              action: "PLAN_SPLIT_WALLET_REFUNDED",
              entityType: "Payment",
              entityId: walletPayment.id,
              afterState: { failedOnlinePaymentId: payment.id },
            },
          });
        }
      }
    }
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
