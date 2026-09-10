import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export type PaymentIntent = {
  paymentExternalId: string;
  amountPaise: number;
  idempotencyKey: string;
  purpose: string;
};

/**
 * This DTO intentionally contains only values that are safe to send to a
 * browser. Provider secrets never leave this module or the server process.
 */
export type CheckoutOrder = {
  provider: "razorpay";
  paymentExternalId: string;
  orderId: string;
  keyId: string;
  amountPaise: number;
  currency: "INR";
};

export type VerifiedPaymentWebhook = {
  provider: "razorpay";
  providerEventId: string;
  type: "PAYMENT_SUCCEEDED" | "PAYMENT_FAILED";
  paymentExternalId: string;
  providerOrderId: string;
  providerReference: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

export interface PaymentProvider {
  readonly provider: "razorpay";
  createCheckoutOrder(intent: PaymentIntent): Promise<CheckoutOrder>;
  checkoutOrderFromExisting(intent: PaymentIntent, orderId: string): CheckoutOrder;
  verifyWebhook(rawBody: string, signature: string | null): VerifiedPaymentWebhook;
}

export type PaymentProviderAvailability =
  | { available: true; provider: PaymentProvider }
  | { available: false; reason: "NOT_CONFIGURED" | "UNSUPPORTED_PROVIDER" };

export class PaymentProviderRequestError extends Error {
  constructor(message = "The payment provider could not create a checkout order") {
    super(message);
    this.name = "PaymentProviderRequestError";
  }
}

export class PaymentProviderSignatureError extends Error {
  constructor() {
    super("Invalid payment-provider webhook signature");
    this.name = "PaymentProviderSignatureError";
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
};

const razorpayWebhookSchema = z.object({
  event: z.enum(["payment.captured", "payment.failed"]),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string().min(1).max(200),
        order_id: z.string().min(1).max(200),
        created_at: z.number().int().nonnegative().optional(),
        notes: z.record(z.unknown()).default({}),
      }),
    }),
  }),
});

const razorpayOrderSchema = z.object({
  id: z.string().min(1).max(200),
  amount: z.number().int().positive(),
  currency: z.literal("INR"),
});

function equalDigest(expected: string, supplied: string) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const suppliedBuffer = Buffer.from(supplied, "hex");
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

function externalIdFromNotes(notes: Record<string, unknown>) {
  const externalId = notes.foundation_payment_external_id;
  if (typeof externalId !== "string" || !z.string().uuid().safeParse(externalId).success)
    throw new PaymentProviderSignatureError();
  return externalId;
}

/**
 * A real Razorpay Orders API adapter. It never represents an online payment as
 * successful: settlement is driven solely by a verified provider webhook.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly provider = "razorpay" as const;

  constructor(
    private readonly config: RazorpayConfig,
    private readonly fetchImplementation: FetchLike = fetch,
  ) {}

  checkoutOrderFromExisting(intent: PaymentIntent, orderId: string): CheckoutOrder {
    return {
      provider: this.provider,
      paymentExternalId: intent.paymentExternalId,
      orderId,
      keyId: this.config.keyId,
      amountPaise: intent.amountPaise,
      currency: "INR",
    };
  }

  async createCheckoutOrder(intent: PaymentIntent): Promise<CheckoutOrder> {
    if (!Number.isSafeInteger(intent.amountPaise) || intent.amountPaise <= 0)
      throw new PaymentProviderRequestError("Invalid payment amount");

    let response: Response;
    try {
      response = await this.fetchImplementation("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString("base64")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          amount: intent.amountPaise,
          currency: "INR",
          // The public payment UUID is the reconciliation key; it is not a secret.
          receipt: intent.paymentExternalId,
          notes: {
            foundation_payment_external_id: intent.paymentExternalId,
            foundation_purpose: intent.purpose,
            foundation_idempotency_key: intent.idempotencyKey,
          },
        }),
      });
    } catch {
      throw new PaymentProviderRequestError();
    }
    if (!response.ok) throw new PaymentProviderRequestError();

    let order: z.infer<typeof razorpayOrderSchema>;
    try {
      order = razorpayOrderSchema.parse(await response.json());
    } catch {
      throw new PaymentProviderRequestError("The payment provider returned an invalid order");
    }
    if (order.amount !== intent.amountPaise)
      throw new PaymentProviderRequestError("The payment provider returned an incorrect amount");
    return this.checkoutOrderFromExisting(intent, order.id);
  }

  verifyWebhook(rawBody: string, signature: string | null): VerifiedPaymentWebhook {
    if (!signature) throw new PaymentProviderSignatureError();
    const expected = createHmac("sha256", this.config.webhookSecret).update(rawBody).digest("hex");
    if (!equalDigest(expected, signature)) throw new PaymentProviderSignatureError();

    const parsed = razorpayWebhookSchema.parse(JSON.parse(rawBody));
    const entity = parsed.payload.payment.entity;
    return {
      provider: this.provider,
      // Razorpay payloads do not carry a delivery UUID. This stable natural key
      // makes retried deliveries idempotent while keeping failed/captured events distinct.
      providerEventId: `${parsed.event}:${entity.id}`,
      type: parsed.event === "payment.captured" ? "PAYMENT_SUCCEEDED" : "PAYMENT_FAILED",
      paymentExternalId: externalIdFromNotes(entity.notes),
      providerOrderId: entity.order_id,
      providerReference: entity.id,
      occurredAt: new Date((entity.created_at ?? Math.floor(Date.now() / 1000)) * 1000),
      payload: parsed as Record<string, unknown>,
    };
  }
}

/**
 * Online payment is deliberately disabled until an explicitly supported
 * provider and all its credentials (including the webhook secret) are present.
 */
export function getPaymentProvider(
  environment: Record<string, string | undefined> = process.env,
  fetchImplementation?: FetchLike,
): PaymentProviderAvailability {
  const provider = environment.PAYMENT_PROVIDER?.trim().toLowerCase();
  if (!provider) return { available: false, reason: "NOT_CONFIGURED" };
  if (provider !== "razorpay") return { available: false, reason: "UNSUPPORTED_PROVIDER" };

  const keyId = environment.RAZORPAY_KEY_ID?.trim();
  const keySecret = environment.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = environment.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!keyId || !keySecret || !webhookSecret) return { available: false, reason: "NOT_CONFIGURED" };

  return {
    available: true,
    provider: new RazorpayPaymentProvider({ keyId, keySecret, webhookSecret }, fetchImplementation),
  };
}
