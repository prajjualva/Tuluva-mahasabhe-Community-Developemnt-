import { assertSupportAmount, SUPPORT_PAYMENT_AMOUNT_PAISE } from "./support-payment-policy";

/**
 * A payout adapter is intentionally separate from the member checkout gateway.
 * Community Support is a bank disbursement, not a browser payment. Adapters
 * receive encrypted bank material only inside server code and must never expose
 * it in a checkout payload or API response.
 */
export type SupportTransferIntent = {
  supportPaymentExternalId: string;
  amountPaise: number;
  idempotencyKey: string;
  encryptedBankRecord: unknown;
};

export type SupportTransferSubmission = {
  provider: string;
  transferReference: string;
  outcome: "PENDING" | "SUCCEEDED" | "FAILED";
};

export interface SupportTransferProvider {
  provider: string;
  submitTransfer(intent: SupportTransferIntent): Promise<SupportTransferSubmission>;
}

export type SupportTransferProviderAvailability =
  | { available: true; provider: SupportTransferProvider }
  | { available: false; reason: "NOT_CONFIGURED" | "UNSUPPORTED_PROVIDER" };

/**
 * No fake production payout adapter exists. A concrete provider can be wired
 * here only after its credentials, transfer webhook validation, and bank-data
 * handling are separately reviewed. Until then the persisted command remains
 * pending for an Administrator to record the genuine bank transfer reference.
 */
export function getSupportTransferProvider(
  environment: Record<string, string | undefined> = process.env,
): SupportTransferProviderAvailability {
  const provider = environment.SUPPORT_TRANSFER_PROVIDER?.trim().toLowerCase();
  if (!provider) return { available: false, reason: "NOT_CONFIGURED" };
  return { available: false, reason: "UNSUPPORTED_PROVIDER" };
}

export function validateSupportTransferIntent(intent: SupportTransferIntent): void {
  assertSupportAmount(intent.amountPaise);
  if (intent.amountPaise !== SUPPORT_PAYMENT_AMOUNT_PAISE)
    throw new Error("Invalid Community Support transfer amount");
  if (!intent.idempotencyKey.trim()) throw new Error("A transfer idempotency key is required");
  if (!intent.encryptedBankRecord) throw new Error("Verified encrypted bank details are required");
}
