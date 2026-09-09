import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  completeWebhook,
  failPayment,
  recordWebhook,
  settlePayment,
} from "../../../../../server/payments/payment-service";
import { prisma } from "../../../../../server/database/prisma";

const eventSchema = z.object({
  eventId: z.string().min(1).max(200),
  type: z.enum(["PAYMENT_SUCCEEDED", "PAYMENT_FAILED"]),
  paymentId: z.string().uuid(), // API-safe Payment.externalId, never a database primary key.
  providerReference: z.string().min(1).max(200),
  payload: z.record(z.unknown()),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!/^[a-z0-9_-]{2,40}$/i.test(provider))
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  try {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    const rawBody = await request.text();
    const signature = request.headers.get("x-payment-signature");
    if (!secret || !signature)
      return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    const body = eventSchema.parse(JSON.parse(rawBody));
    const webhook = await recordWebhook(provider, body.eventId, body.payload);
    if (!webhook.shouldProcess) return NextResponse.json({ accepted: true, duplicate: true });
    const payment = await prisma.payment.findUnique({
      where: { externalId: body.paymentId },
      select: { id: true },
    });
    if (!payment) return NextResponse.json({ error: "Unknown payment" }, { status: 404 });
    if (body.type === "PAYMENT_SUCCEEDED")
      await settlePayment(payment.id, undefined, body.providerReference);
    else await failPayment(payment.id);
    await completeWebhook(provider, body.eventId);
    return NextResponse.json({ accepted: true });
  } catch {
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }
}
