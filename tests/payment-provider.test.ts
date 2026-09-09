import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
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

  it("accepts only a signed Razorpay webhook and normalizes it without trusting client input", () => {
    const configured = getPaymentProvider(environment);
    if (!configured.available) throw new Error("Expected configured payment provider");
    const provider = configured.provider;
    const rawBody = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_real_gateway_123",
            order_id: "order_real_gateway_123",
            notes: { foundation_payment_external_id: paymentExternalId },
          },
        },
      },
    });
    const signature = createHmac("sha256", environment.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    expect(provider.verifyWebhook(rawBody, signature)).toMatchObject({
      provider: "razorpay",
      providerEventId: "payment.captured:pay_real_gateway_123",
      type: "PAYMENT_SUCCEEDED",
      paymentExternalId,
      providerOrderId: "order_real_gateway_123",
      providerReference: "pay_real_gateway_123",
    });
    expect(() => provider.verifyWebhook(rawBody, "not-a-valid-signature")).toThrow(
      PaymentProviderSignatureError,
    );
  });
});
