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
  new window.Razorpay({
    key: checkout.keyId,
    amount: checkout.amountPaise,
    currency: checkout.currency,
    order_id: checkout.orderId,
    name: "Tuluva Mahasabhe",
    description: "Foundation contribution or membership payment",
    notes: { foundation_payment_external_id: checkout.paymentExternalId },
    handler: () => undefined,
  }).open();
}
