import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  completeWebhook,
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
  if (provider !== "razorpay")
    return NextResponse.json({ error: "Unknown payment provider" }, { status: 404 });
  // Receive signed Razorpay events even while member checkout is paused.
  const configured = getPaymentProvider({ ...process.env, PAYMENT_PROVIDER: provider });
  if (!configured.available)
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 1024 * 1024)
      return NextResponse.json({ error: "Webhook too large" }, { status: 413 });
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
        where: { providerOrderId: webhook.providerOrderId },
        select: { id: true, method: true, amountPaise: true },
      });
      // Razorpay may send empty payment notes. Match the unique order previously stored
      // by the server and verify the amount before applying any financial changes.
      if (
        !payment ||
        payment.method !== "ONLINE" ||
        payment.amountPaise !== webhook.amountPaise ||
        webhook.currency !== "INR"
      )
        return NextResponse.json({ error: "Unknown online payment order" }, { status: 400 });

      // A failed Razorpay payment attempt can be retried against the same order.
      // Keep the order payable and retain the attempt in the webhook log.
      if (webhook.type === "PAYMENT_SUCCEEDED")
        await settlePayment(payment.id, undefined, webhook.providerReference, webhook.occurredAt);
    } else {
      const refund = await prisma.paymentRefund.findUnique({
        where: webhook.refundExternalId
          ? { externalId: webhook.refundExternalId }
          : { providerReference: webhook.refundReference },
        select: {
          externalId: true,
          amountPaise: true,
          method: true,
          providerReference: true,
          payment: { select: { providerReference: true } },
        },
      });
      if (
        !refund ||
        refund.method !== "ONLINE" ||
        (refund.providerReference !== null &&
          refund.providerReference !== webhook.refundReference) ||
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
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
