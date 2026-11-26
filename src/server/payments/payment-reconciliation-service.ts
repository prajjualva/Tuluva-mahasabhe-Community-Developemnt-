import { z } from "zod";
import { prisma } from "../database/prisma";
import { getPaymentProvider, type PaymentProvider } from "./payment-provider";
import { runSerializablePaymentTransaction } from "./payment-integrity";
import { settlePaymentInTransaction } from "./payment-service";

/** Read provider evidence outside the transaction; never accept browser-selected amounts/statuses. */
export async function reconcileOwnedOnlinePayment(
  userId: string,
  externalId: string,
  actorId?: string,
  providerOverride?: PaymentProvider,
) {
  z.uuid().parse(externalId);
  const payment = await prisma.payment.findFirst({
    where: { externalId, member: { userId }, method: "ONLINE" },
    select: {
      id: true,
      externalId: true,
      status: true,
      providerOrderId: true,
      amountPaise: true,
      receipt: { select: { receiptNumber: true } },
      refund: { select: { status: true } },
    },
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.refund?.status === "SUCCEEDED")
    return { status: "REFUNDED", receiptNumber: payment.receipt?.receiptNumber ?? null };
  if (payment.status === "SUCCEEDED")
    return { status: payment.status, receiptNumber: payment.receipt?.receiptNumber ?? null };
  if (!["PENDING", "FAILED"].includes(payment.status) || !payment.providerOrderId)
    return { status: payment.status, receiptNumber: null };
  // Reconciliation must continue to work while creation of new checkouts is paused.
  const configured = providerOverride
    ? { available: true as const, provider: providerOverride }
    : getPaymentProvider({ ...process.env, PAYMENT_PROVIDER: "razorpay" });
  if (!configured.available) throw new Error("Provider confirmation unavailable");
  const capture = await configured.provider.findCapturedOrderPayment(
    payment.providerOrderId,
    payment.amountPaise,
  );
  if (!capture) return { status: payment.status, receiptNumber: null };
  if (
    capture.providerOrderId !== payment.providerOrderId ||
    capture.amountPaise !== payment.amountPaise ||
    capture.currency !== "INR"
  )
    throw new Error("Provider confirmation does not match payment");
  return runSerializablePaymentTransaction(
    async (tx) => {
      // Fetch APIs do not provide a signed capture event timestamp. Use the
      // verification time conservatively for plan deadlines, never created_at.
      const result = await settlePaymentInTransaction(
        tx,
        payment.id,
        actorId,
        capture.providerReference,
        capture.verifiedAt,
      );
      if (!result.alreadySettled)
        await tx.auditLog.create({
          data: {
            actorId,
            actorRole: actorId ? undefined : "SYSTEM",
            action: "PAYMENT_PROVIDER_RECONCILED",
            entityType: "Payment",
            entityId: payment.id,
            reason:
              "Authenticated Razorpay API confirmed a captured payment for the persisted order; webhook confirmation was unavailable.",
            afterState: {
              paymentExternalId: externalId,
              providerOrderId: capture.providerOrderId,
              providerReference: capture.providerReference,
              amountPaise: capture.amountPaise,
              verifiedAt: capture.verifiedAt.toISOString(),
            },
          },
        });
      return {
        status: result.payment.status,
        receiptNumber: result.receipt?.receiptNumber ?? null,
      };
    },
    { timeoutMs: 60000 },
  );
}
