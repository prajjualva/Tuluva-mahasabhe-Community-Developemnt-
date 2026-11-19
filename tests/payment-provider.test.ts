import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { POST as postWebhook } from "../src/app/api/payments/webhooks/[provider]/route";
import {
  getPaymentProvider,
  PaymentProviderRequestError,
  PaymentProviderSignatureError,
  RazorpayPaymentProvider,
} from "../src/server/payments/payment-provider";

const paymentExternalId = "cd6d0d5f-f9c4-44e1-8c6d-89b1d30574d1";
const environment = {
  PAYMENT_PROVIDER: "razorpay",
  RAZORPAY_KEY_ID: "rzp_test_public_key",
  RAZORPAY_KEY_SECRET: "gateway-secret-that-must-stay-server-side",
  RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
};

describe("online payment-provider boundary", () => {
  it("allows the webhook to verify signatures before checkout is enabled", async () => {
    try {
      for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
      vi.stubEnv("PAYMENT_PROVIDER", undefined);
      expect(getPaymentProvider().available).toBe(false);
      const body = "{";
      const makeRequest = (headers: Record<string, string>) =>
        new NextRequest("http://localhost/api/payments/webhooks/razorpay", {
          method: "POST",
          body,
          headers,
        });
      const context = { params: Promise.resolve({ provider: "razorpay" }) };
      expect((await postWebhook(makeRequest({}), context)).status).toBe(401);
      const signature = createHmac("sha256", environment.RAZORPAY_WEBHOOK_SECRET)
        .update(body)
        .digest("hex");
      expect(
        (await postWebhook(makeRequest({ "x-razorpay-signature": signature }), context)).status,
      ).toBe(400);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps online payments disabled unless a supported provider has every credential", () => {
    expect(getPaymentProvider({}).available).toBe(false);
    expect(getPaymentProvider({ PAYMENT_PROVIDER: "stripe" })).toEqual({
      available: false,
      reason: "UNSUPPORTED_PROVIDER",
    });
    expect(
      getPaymentProvider({
        PAYMENT_PROVIDER: "razorpay",
        RAZORPAY_KEY_ID: "public",
        RAZORPAY_KEY_SECRET: "secret",
      }),
    ).toEqual({ available: false, reason: "NOT_CONFIGURED" });
  });

  it("creates a real Razorpay order and returns only browser-safe checkout values", async () => {
    let receivedBody = "";
    let receivedAuthorization = "";
    const provider = new RazorpayPaymentProvider(
      {
        keyId: environment.RAZORPAY_KEY_ID,
        keySecret: environment.RAZORPAY_KEY_SECRET,
        webhookSecret: environment.RAZORPAY_WEBHOOK_SECRET,
      },
      async (_input, init) => {
        receivedBody = String(init?.body);
        receivedAuthorization = String((init?.headers as Record<string, string>).authorization);
        return new Response(
          JSON.stringify({ id: "order_real_gateway_123", amount: 36_900, currency: "INR" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    const checkout = await provider.createCheckoutOrder({
      paymentExternalId,
      amountPaise: 36_900,
      idempotencyKey: "member-request-key-0001",
      purpose: "MEMBERSHIP",
    });

    expect(checkout).toEqual({
      provider: "razorpay",
      paymentExternalId,
      orderId: "order_real_gateway_123",
      keyId: environment.RAZORPAY_KEY_ID,
      amountPaise: 36_900,
      currency: "INR",
    });
    expect(JSON.parse(receivedBody)).toMatchObject({
      amount: 36_900,
      currency: "INR",
      receipt: paymentExternalId,
      notes: { foundation_payment_external_id: paymentExternalId },
    });
    expect(receivedAuthorization).toMatch(/^Basic /);
    expect(JSON.stringify(checkout)).not.toContain(environment.RAZORPAY_KEY_SECRET);
  });

  it("rejects a malformed or amount-mismatched provider order instead of fabricating a checkout", async () => {
    const provider = new RazorpayPaymentProvider(
      {
        keyId: environment.RAZORPAY_KEY_ID,
        keySecret: environment.RAZORPAY_KEY_SECRET,
        webhookSecret: environment.RAZORPAY_WEBHOOK_SECRET,
      },
      async () =>
        new Response(JSON.stringify({ id: "order_wrong", amount: 1, currency: "INR" }), {
          status: 200,
        }),
    );

    await expect(
      provider.createCheckoutOrder({
        paymentExternalId,
        amountPaise: 36_900,
        idempotencyKey: "member-request-key-0001",
        purpose: "MEMBERSHIP",
      }),
    ).rejects.toBeInstanceOf(PaymentProviderRequestError);
  });

  it("submits a Razorpay refund with the provider's idempotency header", async () => {
    let receivedBody = "";
    let receivedHeaders: Record<string, string> = {};
    const provider = new RazorpayPaymentProvider(
      {
        keyId: environment.RAZORPAY_KEY_ID,
        keySecret: environment.RAZORPAY_KEY_SECRET,
        webhookSecret: environment.RAZORPAY_WEBHOOK_SECRET,
      },
      async (_input, init) => {
        receivedBody = String(init?.body);
        receivedHeaders = init?.headers as Record<string, string>;
        return new Response(
          JSON.stringify({
            id: "rfnd_real_gateway_123",
            amount: 36_900,
            payment_id: "pay_real_gateway_123",
            status: "processed",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    await expect(
      provider.refundCapturedPayment({
        refundExternalId: "8b8a1c80-341f-4450-9683-7c7bc3435ae2",
        providerPaymentReference: "pay_real_gateway_123",
        amountPaise: 36_900,
        idempotencyKey: "refund-command-0001",
      }),
    ).resolves.toEqual({
      provider: "razorpay",
      refundReference: "rfnd_real_gateway_123",
      status: "SUCCEEDED",
    });
    expect(receivedHeaders["x-refund-idempotency"]).toBe("refund-command-0001");
    expect(JSON.parse(receivedBody)).toMatchObject({
      amount: 36_900,
      receipt: "8b8a1c80-341f-4450-9683-7c7bc3435ae2",
    });
  });

  it("accepts only a signed Razorpay webhook and normalizes it without trusting client input", () => {
    const configured = getPaymentProvider(environment);
    if (!configured.available) throw new Error("Expected configured payment provider");
    const provider = configured.provider;
    const rawBody = JSON.stringify({
      event: "payment.captured",
      created_at: 1_788_912_000,
      payload: {
        payment: {
          entity: {
            id: "pay_real_gateway_123",
            order_id: "order_real_gateway_123",
            amount: 36900,
            currency: "INR",
            created_at: 1_788_912_000,
            notes: {
              foundation_payment_external_id: paymentExternalId,
              password: "secret-never-persist",
            },
            card: { last4: "1234" },
          },
        },
      },
    });
    const signature = createHmac("sha256", environment.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    expect(provider.verifyWebhook(rawBody, signature)).toMatchObject({
      provider: "razorpay",
      kind: "PAYMENT",
      providerEventId: "payment.captured:pay_real_gateway_123",
      type: "PAYMENT_SUCCEEDED",
      providerOrderId: "order_real_gateway_123",
      providerReference: "pay_real_gateway_123",
      amountPaise: 36900,
      currency: "INR",
      occurredAt: new Date("2026-09-09T00:00:00.000Z"),
    });
    expect(() => provider.verifyWebhook(rawBody, "not-a-valid-signature")).toThrow(
      PaymentProviderSignatureError,
    );
    expect(JSON.stringify(provider.verifyWebhook(rawBody, signature).payload)).not.toMatch(
      /secret-never-persist|card|last4/,
    );
    for (const notes of [[], undefined]) {
      const event = JSON.parse(rawBody);
      event.payload.payment.entity.notes = notes;
      const body = JSON.stringify(event);
      const signed = createHmac("sha256", environment.RAZORPAY_WEBHOOK_SECRET)
        .update(body)
        .digest("hex");
      expect(provider.verifyWebhook(body, signed)).toMatchObject({
        providerOrderId: "order_real_gateway_123",
        type: "PAYMENT_SUCCEEDED",
      });
    }
    for (const replacement of [{ amount: 1.25 }, { amount: -100 }, { currency: "USD" }]) {
      const invalid = JSON.parse(rawBody);
      Object.assign(invalid.payload.payment.entity, replacement);
      const body = JSON.stringify(invalid);
      const signed = createHmac("sha256", environment.RAZORPAY_WEBHOOK_SECRET)
        .update(body)
        .digest("hex");
      expect(() => provider.verifyWebhook(body, signed)).toThrow();
    }
  });

  it("normalizes a signed processed-refund webhook using the Foundation refund UUID", () => {
    const configured = getPaymentProvider(environment);
    if (!configured.available) throw new Error("Expected configured payment provider");
    const refundExternalId = "8b8a1c80-341f-4450-9683-7c7bc3435ae2";
    const rawBody = JSON.stringify({
      event: "refund.processed",
      created_at: 1_788_912_000,
      payload: {
        refund: {
          entity: {
            id: "rfnd_real_gateway_123",
            payment_id: "pay_real_gateway_123",
            amount: 36_900,
            created_at: 1_788_912_000,
            notes: { foundation_refund_external_id: refundExternalId },
          },
        },
      },
    });
    const signature = createHmac("sha256", environment.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    expect(configured.provider.verifyWebhook(rawBody, signature)).toMatchObject({
      provider: "razorpay",
      kind: "REFUND",
      type: "REFUND_SUCCEEDED",
      refundExternalId,
      refundReference: "rfnd_real_gateway_123",
      providerPaymentReference: "pay_real_gateway_123",
      amountPaise: 36_900,
    });
  });
});
