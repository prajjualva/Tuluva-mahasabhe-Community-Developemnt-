"use client";
export type Checkout = {
  provider: "razorpay";
  paymentExternalId: string;
  orderId: string;
  keyId: string;
  amountPaise: number;
  currency: "INR";
};
type RazorpayConstructor = new (options: Record<string, unknown>) => { open(): void };
export type GatewayOutcome = { status: string; receiptNumber?: string | null };
declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

export async function openGatewayCheckout(checkout: Checkout) {
  if (!window.Razorpay) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load the payment checkout"));
      document.head.appendChild(script);
    });
  }
  if (!window.Razorpay) throw new Error("Payment checkout is unavailable");
  const Razorpay = window.Razorpay;
  return new Promise<GatewayOutcome>((resolve, reject) => {
    let confirming = false;
    new Razorpay({
      key: checkout.keyId,
      amount: checkout.amountPaise,
      currency: checkout.currency,
      order_id: checkout.orderId,
      name: "Tuluva Mahasabhe",
      description: "Foundation contribution or membership payment",
      notes: { foundation_payment_external_id: checkout.paymentExternalId },
      // Browser callback is only a signal to ask our authenticated server to
      // fetch the actual captured order. Never trust a client success flag.
      handler: async () => {
        if (confirming) return;
        confirming = true;
        try {
          resolve(await verifyGatewayPayment(checkout.paymentExternalId));
        } catch (error) {
          reject(error);
        }
      },
      modal: {
        ondismiss: () => {
          if (!confirming) resolve({ status: "PENDING" });
        },
      },
    }).open();
  });
}

export async function verifyGatewayPayment(paymentExternalId: string): Promise<GatewayOutcome> {
  const response = await fetch(
    `/api/member/payments/${encodeURIComponent(paymentExternalId)}/verify`,
    { method: "POST" },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      "Your payment is awaiting confirmation. If your bank was debited, do not pay again. Use Check payment status.",
    );
  return result;
}
