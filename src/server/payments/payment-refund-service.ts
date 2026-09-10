import { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { runSerializablePaymentTransaction } from "./payment-integrity";
import { getPaymentProvider } from "./payment-provider";

type RefundRequestInput = {
  paymentExternalId: string;
  actorId: string;
  reason: string;
  idempotencyKey: string;
};

type RefundSettlementInput = {
  refundExternalId: string;
  actorId?: string;
  providerReference?: string;
  settledAt?: Date;
};

const isManualMethod = (method: PaymentMethod) => method === "CASH" || method === "MANUAL";

async function createOrLoadRefundRequest(input: RefundRequestInput) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("A refund reason is required");
  return runSerializablePaymentTransaction(async (tx) => {
    const replay = await tx.paymentRefund.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { payment: true },
    });
    if (replay) {
      if (replay.payment.externalId !== input.paymentExternalId)
        throw new Error("Idempotency key is already in use");
      return { refund: replay, payment: replay.payment, created: false };
    }
    const payment = await tx.payment.findUnique({
      where: { externalId: input.paymentExternalId },
      include: { refund: true },
    });
    if (!payment || payment.status !== "SUCCEEDED")
      throw new Error("Only a successful payment can be refunded");
    if (payment.refund) return { refund: payment.refund, payment, created: false };

    const refund = await tx.paymentRefund.create({
      data: {
        paymentId: payment.id,
        amountPaise: payment.amountPaise,
        method: payment.method,
        reason,
        idempotencyKey: input.idempotencyKey,
        authorizedActorId: input.actorId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "PAYMENT_REFUND_REQUESTED",
        entityType: "PaymentRefund",
        entityId: refund.id,
        reason,
        afterState: {
          paymentExternalId: payment.externalId,
          amountPaise: refund.amountPaise,
          method: refund.method,
        },
      },
    });
    return { refund, payment, created: true };
  });
}

/**
 * Finalizes an already-authorized refund with compensating ledger entries.
 * It deliberately leaves the original successful payment and receipt immutable.
 */
export async function settlePaymentRefund(input: RefundSettlementInput) {
  return runSerializablePaymentTransaction(async (tx) => {
    const refund = await tx.paymentRefund.findUnique({
      where: { externalId: input.refundExternalId },
      include: { payment: true },
    });
    if (!refund) throw new Error("Refund not found");
    if (refund.status === "SUCCEEDED") {
      if (input.providerReference && refund.providerReference !== input.providerReference)
        throw new Error("Refund reference does not match");
      return refund;
    }
    if (refund.status !== "PENDING") throw new Error("Refund is not pending");
    if (refund.method === "ONLINE" && !input.providerReference)
      throw new Error("Online refund reference is required");
    if (
      input.providerReference &&
      refund.providerReference &&
      refund.providerReference !== input.providerReference
    )
      throw new Error("Refund reference does not match");

    if (refund.method === "WALLET") {
      if (!refund.payment.memberId) throw new Error("Wallet refund has no member");
      const wallet = await tx.wallet.findUnique({ where: { memberId: refund.payment.memberId } });
      if (!wallet) throw new Error("Wallet refund has no Foundation wallet");
      const changed = await tx.wallet.updateMany({
        where: { id: wallet.id, version: wallet.version },
        data: { balancePaise: { increment: refund.amountPaise }, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("Wallet balance changed; retry refund");
      const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          direction: "CREDIT",
          amountPaise: refund.amountPaise,
          balanceAfterPaise: updated.balancePaise,
          purpose: "PAYMENT_REFUND",
          relatedExternalId: refund.externalId,
        },
      });
    }

    const completedAt = input.settledAt ?? new Date();
    const settled = await tx.paymentRefund.update({
      where: { id: refund.id },
      data: {
        status: "SUCCEEDED",
        providerReference: input.providerReference ?? refund.providerReference,
        completedAt,
      },
    });
    await tx.foundationLedger.create({
      data: {
        direction: "DEBIT",
        amountPaise: refund.amountPaise,
        purpose: "PAYMENT_REFUND",
        relatedExternalId: refund.externalId,
        authorizedActorId: input.actorId ?? refund.authorizedActorId,
        status: "SUCCEEDED",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? refund.authorizedActorId,
        actorRole: input.actorId || refund.authorizedActorId ? undefined : "SYSTEM",
        action: "PAYMENT_REFUND_SETTLED",
        entityType: "PaymentRefund",
        entityId: refund.id,
        afterState: {
          amountPaise: refund.amountPaise,
          method: refund.method,
          providerReference: input.providerReference ?? refund.providerReference,
        },
      },
    });
    return settled;
  });
}

export async function failPaymentRefund(
  refundExternalId: string,
  actorId?: string,
  providerReference?: string,
) {
  return runSerializablePaymentTransaction(async (tx) => {
    const refund = await tx.paymentRefund.findUnique({ where: { externalId: refundExternalId } });
    if (!refund) throw new Error("Refund not found");
    if (refund.status === "FAILED") return refund;
    if (refund.status !== "PENDING") throw new Error("Refund outcome is immutable");
    const failed = await tx.paymentRefund.update({
      where: { id: refund.id },
      data: { status: "FAILED", providerReference: providerReference ?? refund.providerReference },
    });
    await tx.auditLog.create({
      data: {
        actorId: actorId ?? refund.authorizedActorId,
        actorRole: actorId || refund.authorizedActorId ? undefined : "SYSTEM",
        action: "PAYMENT_REFUND_FAILED",
        entityType: "PaymentRefund",
        entityId: refund.id,
        afterState: { providerReference: providerReference ?? refund.providerReference },
      },
    });
    return failed;
  });
}

async function noteProviderRefund(
  refundExternalId: string,
  providerReference: string,
  actorId: string,
) {
  return runSerializablePaymentTransaction(async (tx) => {
    const refund = await tx.paymentRefund.findUnique({ where: { externalId: refundExternalId } });
    if (!refund) throw new Error("Refund not found");
    if (refund.status !== "PENDING") return refund;
    if (refund.providerReference && refund.providerReference !== providerReference)
      throw new Error("Refund reference does not match");
    const updated = await tx.paymentRefund.update({
      where: { id: refund.id },
      data: { providerReference },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "PAYMENT_REFUND_SUBMITTED_TO_PROVIDER",
        entityType: "PaymentRefund",
        entityId: refund.id,
        afterState: { providerReference },
      },
    });
    return updated;
  });
}

/**
 * Starts one full refund per payment. Online refunds are submitted to the real
 * provider with its idempotency header; cash/manual refunds deliberately remain
 * pending until an Administrator records the actual external disbursement.
 */
export async function requestPaymentRefund(input: RefundRequestInput) {
  const request = await createOrLoadRefundRequest(input);
  if (request.refund.status === "SUCCEEDED" || request.refund.status === "FAILED")
    return { refund: request.refund, outcome: request.refund.status } as const;

  if (request.refund.method === "WALLET") {
    return {
      refund: await settlePaymentRefund({
        refundExternalId: request.refund.externalId,
        actorId: input.actorId,
      }),
      outcome: "SUCCEEDED" as const,
    };
  }
  if (isManualMethod(request.refund.method))
    return { refund: request.refund, outcome: "MANUAL_ACTION_REQUIRED" as const };

  if (!request.payment.providerReference)
    throw new Error("Captured provider reference is required for an online refund");
  const provider = getPaymentProvider();
  if (!provider.available)
    return { refund: request.refund, outcome: "PROVIDER_UNAVAILABLE" as const };

  const providerRefund = await provider.provider.refundCapturedPayment({
    refundExternalId: request.refund.externalId,
    providerPaymentReference: request.payment.providerReference,
    amountPaise: request.refund.amountPaise,
    idempotencyKey: request.refund.idempotencyKey,
  });
  if (providerRefund.status === "SUCCEEDED")
    return {
      refund: await settlePaymentRefund({
        refundExternalId: request.refund.externalId,
        actorId: input.actorId,
        providerReference: providerRefund.refundReference,
      }),
      outcome: "SUCCEEDED" as const,
    };
  if (providerRefund.status === "FAILED")
    return {
      refund: await failPaymentRefund(
        request.refund.externalId,
        input.actorId,
        providerRefund.refundReference,
      ),
      outcome: "FAILED" as const,
    };
  return {
    refund: await noteProviderRefund(
      request.refund.externalId,
      providerRefund.refundReference,
      input.actorId,
    ),
    outcome: "PENDING" as const,
  };
}

export async function settleManualPaymentRefund(input: {
  refundExternalId: string;
  actorId: string;
  reference: string;
}) {
  if (!input.reference.trim()) throw new Error("A manual refund reference is required");
  const refund = await prisma.paymentRefund.findUnique({
    where: { externalId: input.refundExternalId },
    select: { method: true },
  });
  if (!refund || !isManualMethod(refund.method))
    throw new Error("This refund requires provider confirmation");
  return settlePaymentRefund({
    refundExternalId: input.refundExternalId,
    actorId: input.actorId,
    providerReference: input.reference.trim(),
  });
}

export const refundPrismaError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
