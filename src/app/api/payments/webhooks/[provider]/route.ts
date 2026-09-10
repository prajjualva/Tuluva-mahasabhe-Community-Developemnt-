import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  completeWebhook,
  failPayment,
  recordWebhook,
  settlePayment,
} from "../../../../../server/payments/payment-service";
import {
  failPaymentRefund,
  settlePaymentRefund,
} from "../../../../../server/payments/payment-refund-service";
import { prisma } from "../../../../../server/database/prisma";
import {
  getPaymentProvider,
  PaymentProviderSignatureError,
} from "../../../../../server/payments/payment-provider";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const configured = getPaymentProvider();
  if (!configured.available)
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  if (provider !== configured.provider.provider)
    return NextResponse.json({ error: "Unknown payment provider" }, { status: 404 });

  try {
    const rawBody = await request.text();
    const webhook = configured.provider.verifyWebhook(
      rawBody,
      request.headers.get("x-razorpay-signature"),
    );
    const recorded = await recordWebhook(
      webhook.provider,
      webhook.providerEventId,
      webhook.payload,
    );
    if (!recorded.shouldProcess) return NextResponse.json({ accepted: true, duplicate: true });

    if (webhook.kind === "PAYMENT") {
      const payment = await prisma.payment.findUnique({
        where: { externalId: webhook.paymentExternalId },
        select: { id: true, method: true, providerOrderId: true },
      });
      // The verified provider order must belong to the exact Foundation payment;
      // provider-supplied notes alone are not enough to authorize settlement.
      if (
        !payment ||
        payment.method !== "ONLINE" ||
        payment.providerOrderId !== webhook.providerOrderId
      )
        return NextResponse.json({ error: "Unknown online payment order" }, { status: 400 });

      if (webhook.type === "PAYMENT_SUCCEEDED")
        await settlePayment(payment.id, undefined, webhook.providerReference, webhook.occurredAt);
      else await failPayment(payment.id);
    } else {
      const refund = await prisma.paymentRefund.findUnique({
        where: { externalId: webhook.refundExternalId },
        select: {
          externalId: true,
          amountPaise: true,
          method: true,
          payment: { select: { providerReference: true } },
        },
      });
      if (
        !refund ||
        refund.method !== "ONLINE" ||
        refund.amountPaise !== webhook.amountPaise ||
        refund.payment.providerReference !== webhook.providerPaymentReference
      )
        return NextResponse.json({ error: "Unknown online refund" }, { status: 400 });
      if (webhook.type === "REFUND_SUCCEEDED")
        await settlePaymentRefund({
          refundExternalId: refund.externalId,
          providerReference: webhook.refundReference,
          settledAt: webhook.occurredAt,
        });
      else await failPaymentRefund(refund.externalId, undefined, webhook.refundReference);
    }
    await completeWebhook(webhook.provider, webhook.providerEventId);
    return NextResponse.json({ accepted: true });
  } catch (error) {
    if (error instanceof PaymentProviderSignatureError)
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    if (error instanceof ZodError || error instanceof SyntaxError)
      return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 400 });
  }
}
