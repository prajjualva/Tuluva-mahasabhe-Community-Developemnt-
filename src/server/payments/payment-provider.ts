export type PaymentIntent = {
  paymentId: string;
  amountPaise: number;
  idempotencyKey: string;
  purpose: string;
};
export type PaymentResult = {
  status: "SUCCEEDED" | "FAILED" | "PENDING";
  providerReference?: string;
};
export interface PaymentProvider {
  createPayment(intent: PaymentIntent): Promise<PaymentResult>;
  verifyWebhook(rawBody: string, signature: string): Promise<{ eventId: string; type: string }>;
}
