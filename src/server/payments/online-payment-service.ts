import { prisma } from "../database/prisma";
import {
  type CheckoutOrder,
  getPaymentProvider,
  type PaymentProviderAvailability,
  type PaymentIntent,
} from "./payment-provider";

export type OnlineCheckoutResult =
  | { available: true; checkout: CheckoutOrder }
  | { available: false; reason: "NOT_CONFIGURED" | "UNSUPPORTED_PROVIDER" };

export function onlinePaymentAvailability(): PaymentProviderAvailability {
  return getPaymentProvider();
}

/**
 * Creates a real provider order for a persisted, pending ONLINE payment.
 * A successful checkout order is not a successful Foundation payment: only a
 * verified provider webhook may settle the payment and issue its receipt.
 */
export async function createOnlineCheckout(input: {
  paymentId: string;
  paymentExternalId: string;
  amountPaise: number;
  idempotencyKey: string;
  purpose: string;
}): Promise<OnlineCheckoutResult> {
  const configured = getPaymentProvider();
  if (!configured.available) return configured;

  const intent: PaymentIntent = {
    paymentExternalId: input.paymentExternalId,
    amountPaise: input.amountPaise,
    idempotencyKey: input.idempotencyKey,
    purpose: input.purpose,
  };
  const existing = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    select: { status: true, method: true, providerReference: true },
  });
  if (!existing || existing.method !== "ONLINE" || existing.status !== "PENDING")
    throw new Error("Online checkout is no longer payable");

  if (existing.providerReference)
    return {
      available: true,
      checkout: configured.provider.checkoutOrderFromExisting(intent, existing.providerReference),
    };

  const checkout = await configured.provider.createCheckoutOrder(intent);
  // Do not overwrite a provider order created by a concurrent retry. Returning
  // the persisted order keeps the member on one checkout order per payment.
  const persisted = await prisma.payment.updateMany({
    where: { id: input.paymentId, status: "PENDING", providerReference: null },
    data: { providerReference: checkout.orderId },
  });
  if (persisted.count === 1) return { available: true, checkout };

  const raced = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    select: { status: true, method: true, providerReference: true },
  });
  if (!raced || raced.method !== "ONLINE" || raced.status !== "PENDING" || !raced.providerReference)
    throw new Error("Online checkout is no longer payable");
  return {
    available: true,
    checkout: configured.provider.checkoutOrderFromExisting(intent, raced.providerReference),
  };
}
