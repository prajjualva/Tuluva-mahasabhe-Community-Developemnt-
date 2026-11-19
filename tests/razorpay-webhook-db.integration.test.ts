import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/payments/webhooks/[provider]/route";
import { prisma } from "../src/server/database/prisma";
import { failPayment } from "../src/server/payments/payment-service";

const databaseDescribe = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const webhookSecret = "synthetic-razorpay-webhook-secret";

async function fixture() {
  const marker = randomUUID();
  const member = await prisma.member.create({
    data: {
      fullName: "Razorpay webhook test",
      address: "Test-only record",
      user: { create: { email: `razorpay-${marker}@example.invalid` } },
    },
  });
  const due = await prisma.due.create({
    data: {
      memberId: member.id,
      purpose: "CONTRIBUTION",
      amountPaise: 10_000,
      dueAt: new Date(Date.now() + 86_400_000),
    },
  });
  const payment = await prisma.payment.create({
    data: {
      memberId: member.id,
      dueId: due.id,
      method: "ONLINE",
      amountPaise: due.amountPaise,
      providerOrderId: `order_${marker}`,
      idempotencyKey: marker,
    },
  });
  return { due, payment, providerReference: `pay_${marker}` };
}

async function deliver(
  event: "payment.captured" | "payment.failed",
  orderId: string | null,
  paymentId: string,
  amount: number,
) {
  return deliverWebhook(event, {
    payment: { entity: { id: paymentId, order_id: orderId, amount, currency: "INR", notes: [] } },
  });
}

async function deliverWebhook(event: string, payload: Record<string, unknown>) {
  vi.stubEnv("PAYMENT_PROVIDER", "razorpay");
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_synthetic");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "synthetic-test-only");
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", webhookSecret);
  const body = JSON.stringify({
    event,
    created_at: Math.floor(Date.now() / 1000),
    payload,
  });
  const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");
  return POST(
    new NextRequest("http://localhost/api/payments/webhooks/razorpay", {
      method: "POST",
      body,
      headers: { "x-razorpay-signature": signature },
    }),
    { params: Promise.resolve({ provider: "razorpay" }) },
  );
}

databaseDescribe("Razorpay payment webhook settlement", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps a failed attempt retryable and settles a later capture exactly once", async () => {
    const { due, payment, providerReference } = await fixture();
    const order = payment.providerOrderId;
    expect((await deliver("payment.failed", order, providerReference, 10_000)).status).toBe(200);
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({
      status: "PENDING",
    });
    expect(await prisma.due.findUnique({ where: { id: due.id } })).toMatchObject({
      status: "PENDING",
    });
    expect((await deliver("payment.captured", order, "pay_wrong_amount", 20_000)).status).toBe(400);
    expect((await deliver("payment.captured", order, providerReference, 10_000)).status).toBe(200);
    const replay = await deliver("payment.captured", order, providerReference, 10_000);
    expect(await replay.json()).toEqual({ accepted: true, duplicate: true });
    expect(await prisma.due.findUnique({ where: { id: due.id } })).toMatchObject({
      status: "PAID",
    });
    const settled = await prisma.payment.findUnique({
      where: { id: payment.id },
      include: { receipt: true },
    });
    expect(settled).toMatchObject({
      status: "SUCCEEDED",
      providerReference,
      receipt: { receiptNumber: expect.stringMatching(/^RCP-/) },
    });
    expect(
      await prisma.foundationLedger.count({ where: { relatedExternalId: payment.externalId } }),
    ).toBe(1);

    const refundReference = `rfnd_${randomUUID()}`;
    const refund = await prisma.paymentRefund.create({
      data: {
        paymentId: payment.id,
        amountPaise: payment.amountPaise,
        method: "ONLINE",
        reason: "Synthetic refund review",
        idempotencyKey: randomUUID(),
        providerReference: refundReference,
      },
    });
    const refundPayload = {
      refund: {
        entity: {
          id: refundReference,
          payment_id: providerReference,
          amount: payment.amountPaise,
          notes: [],
        },
      },
    };
    expect((await deliverWebhook("refund.processed", refundPayload)).status).toBe(200);
    expect(await (await deliverWebhook("refund.processed", refundPayload)).json()).toEqual({
      accepted: true,
      duplicate: true,
    });
    expect(await prisma.paymentRefund.findUnique({ where: { id: refund.id } })).toMatchObject({
      status: "SUCCEEDED",
    });
    expect(
      await prisma.foundationLedger.count({
        where: { relatedExternalId: refund.externalId, direction: "DEBIT" },
      }),
    ).toBe(1);
    expect(await prisma.receipt.findUnique({ where: { paymentId: payment.id } })).toEqual(
      settled?.receipt,
    );
  }, 180_000);

  it("records a late capture for an order previously closed by a failure for refund review", async () => {
    const { due, payment, providerReference } = await fixture();
    await failPayment(payment.id);
    expect(
      (await deliver("payment.captured", payment.providerOrderId, providerReference, 10_000))
        .status,
    ).toBe(200);
    expect(await prisma.due.findUnique({ where: { id: due.id } })).toMatchObject({
      status: "PENDING",
    });
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({
      status: "SUCCEEDED",
      providerReference,
    });
    expect(
      await prisma.foundationLedger.count({
        where: { relatedExternalId: payment.externalId, purpose: "UNAPPLIED_PAYMENT" },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityId: payment.id, action: "UNAPPLIED_PAYMENT_REQUIRES_REFUND_REVIEW" },
      }),
    ).toBe(1);
  }, 120_000);
});
