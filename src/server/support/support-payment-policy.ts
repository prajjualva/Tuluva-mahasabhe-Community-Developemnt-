import { MONEY } from "../../domain/money";

/** The published Community Support amount is ₹1,00,000, stored as paise. */
export const SUPPORT_PAYMENT_AMOUNT_PAISE = MONEY.supportPayment;

export type SupportNomineeCandidate = {
  kind: string;
  status: string;
  isCurrent: boolean;
  hasEncryptedBankDetails: boolean;
};

export type SupportReadinessInput = {
  eventStatus: string | null;
  eventPublishedAt: Date | null;
  dateOfDeath: Date;
  deathDateVerifiedAt: Date | null;
  eligibilityStatus: string;
  documentCount: number;
  verifiedDocumentCount: number;
  documentsVerifiedAt: Date | null;
  nominee: SupportNomineeCandidate | null;
  nomineeVerifiedAt: Date | null;
  bankVerifiedAt: Date | null;
  disputeOpen: boolean;
};

export type SupportReadiness = {
  eventVerified: boolean;
  eventPublished: boolean;
  deathDateVerified: boolean;
  eligible: boolean;
  requiredDocumentsComplete: boolean;
  nomineeVerified: boolean;
  nomineeBankVerified: boolean;
  disputeOpen: boolean;
  missing: string[];
};

/**
 * All currently attached restricted death evidence must be reviewed, and at
 * least one evidence document is mandatory before a support payment can be
 * approved. This is deliberately stricter than a loose "document count".
 */
export function hasCompleteRequiredSupportDocuments(
  documentCount: number,
  verifiedDocumentCount: number,
  verifiedAt: Date | null,
): boolean {
  return documentCount > 0 && verifiedDocumentCount === documentCount && verifiedAt !== null;
}

export function isVerifiedSupportNominee(
  nominee: SupportNomineeCandidate | null,
): nominee is SupportNomineeCandidate {
  return Boolean(
    nominee &&
    ["PRIMARY", "SECONDARY", "BACKUP"].includes(nominee.kind) &&
    nominee.status === "VERIFIED" &&
    nominee.isCurrent,
  );
}

export function isVerifiedSupportBank(
  nominee: SupportNomineeCandidate | null,
  bankVerifiedAt: Date | null,
): boolean {
  return (
    isVerifiedSupportNominee(nominee) && nominee.hasEncryptedBankDetails && bankVerifiedAt !== null
  );
}

/**
 * A secondary or backup nominee can only replace the primary after the Admin
 * records why the primary is unavailable, invalid, or deceased. The reason is
 * intentionally persisted and audited by the command service.
 */
export function assertNomineeSelectionAllowed(
  nominee: SupportNomineeCandidate,
  selectionReason?: string,
): void {
  if (!isVerifiedSupportNominee(nominee))
    throw new Error("The nominee must be current and verified");
  if (!nominee.hasEncryptedBankDetails)
    throw new Error("Verified nominee bank details are required");
  if (nominee.kind !== "PRIMARY" && !selectionReason?.trim())
    throw new Error("A reason is required when selecting a secondary or backup nominee");
}

/**
 * Computes the current, not cached, payout gate. In particular, a later
 * nominee/bank change is checked again at initiate and retry time.
 */
export function evaluateSupportPaymentReadiness(input: SupportReadinessInput): SupportReadiness {
  const eventVerified = input.eventStatus !== null && input.eventStatus !== "CANCELLED";
  const eventPublished =
    eventVerified &&
    input.eventPublishedAt !== null &&
    ["PUBLISHED", "CLOSED"].includes(input.eventStatus ?? "");
  const deathDateVerified =
    input.deathDateVerifiedAt !== null && !Number.isNaN(input.dateOfDeath.valueOf());
  const eligible = input.eligibilityStatus === "ELIGIBLE";
  const requiredDocumentsComplete = hasCompleteRequiredSupportDocuments(
    input.documentCount,
    input.verifiedDocumentCount,
    input.documentsVerifiedAt,
  );
  const nomineeVerified =
    isVerifiedSupportNominee(input.nominee) && input.nomineeVerifiedAt !== null;
  const nomineeBankVerified = isVerifiedSupportBank(input.nominee, input.bankVerifiedAt);
  const missing: string[] = [];
  if (!eventVerified) missing.push("VERIFIED_DEATH_SUPPORT_EVENT");
  if (!eventPublished) missing.push("PUBLISHED_DEATH_SUPPORT_EVENT");
  if (!deathDateVerified) missing.push("VERIFIED_DEATH_DATE");
  if (!eligible) missing.push("ELIGIBILITY");
  if (!requiredDocumentsComplete) missing.push("REQUIRED_DOCUMENTS");
  if (!nomineeVerified) missing.push("VERIFIED_NOMINEE");
  if (!nomineeBankVerified) missing.push("VERIFIED_NOMINEE_BANK_DETAILS");
  if (input.disputeOpen) missing.push("OPEN_NOMINEE_DISPUTE");
  return {
    eventVerified,
    eventPublished,
    deathDateVerified,
    eligible,
    requiredDocumentsComplete,
    nomineeVerified,
    nomineeBankVerified,
    disputeOpen: input.disputeOpen,
    missing,
  };
}

export function assertSupportPaymentReady(readiness: SupportReadiness): void {
  if (readiness.missing.length)
    throw new Error(`Support payment is not ready: ${readiness.missing.join(", ")}`);
}

export function assertSupportAmount(amountPaise: number): void {
  if (amountPaise !== SUPPORT_PAYMENT_AMOUNT_PAISE)
    throw new Error("Community Support payment must be exactly ₹1,00,000");
}

export function restoreStatusAfterResolvedDispute(
  statusBeforeFreeze: string | null,
): "REVIEW" | "APPROVED" | "PAYMENT_FAILED" {
  if (statusBeforeFreeze === "PAYMENT_FAILED") return "PAYMENT_FAILED";
  if (statusBeforeFreeze === "APPROVED" || statusBeforeFreeze === "PAYMENT_PENDING")
    return "APPROVED";
  return "REVIEW";
}
