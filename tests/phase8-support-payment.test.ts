import { describe, expect, it } from "vitest";
import {
  assertNomineeSelectionAllowed,
  assertSupportAmount,
  assertSupportPaymentReady,
  evaluateSupportPaymentReadiness,
  hasCompleteRequiredSupportDocuments,
  restoreStatusAfterResolvedDispute,
  SUPPORT_PAYMENT_AMOUNT_PAISE,
} from "../src/server/support/support-payment-policy";
import {
  getSupportTransferProvider,
  validateSupportTransferIntent,
} from "../src/server/support/support-transfer-provider";

const deathDate = new Date("2026-05-10T00:00:00.000Z");
const reviewedAt = new Date("2026-05-12T00:00:00.000Z");

function readyInput() {
  return {
    eventStatus: "PUBLISHED",
    eventPublishedAt: reviewedAt,
    dateOfDeath: deathDate,
    deathDateVerifiedAt: reviewedAt,
    eligibilityStatus: "ELIGIBLE",
    documentCount: 2,
    verifiedDocumentCount: 2,
    documentsVerifiedAt: reviewedAt,
    nominee: {
      kind: "PRIMARY",
      status: "VERIFIED",
      isCurrent: true,
      hasEncryptedBankDetails: true,
    },
    nomineeVerifiedAt: reviewedAt,
    bankVerifiedAt: reviewedAt,
    disputeOpen: false,
  };
}

describe("Phase 8 Community Support payment policy", () => {
  it("locks every payout at exactly ₹1,00,000", () => {
    expect(SUPPORT_PAYMENT_AMOUNT_PAISE).toBe(10_000_000);
    expect(() => assertSupportAmount(9_999_999)).toThrow("exactly ₹1,00,000");
    expect(() => assertSupportAmount(10_000_001)).toThrow("exactly ₹1,00,000");
    expect(() =>
      validateSupportTransferIntent({
        supportPaymentExternalId: crypto.randomUUID(),
        amountPaise: 1,
        idempotencyKey: crypto.randomUUID(),
        encryptedBankRecord: { test: true },
      }),
    ).toThrow("₹1,00,000");
  });

  it("does not use collection progress as a payout eligibility gate", () => {
    // Contribution collection is deliberately absent from this policy input.
    // A published, eligible death case can therefore be paid even with none
    // of the ₹100 obligations settled.
    const readiness = evaluateSupportPaymentReadiness(readyInput());
    expect(readiness.missing).toEqual([]);
    expect(() => assertSupportPaymentReady(readiness)).not.toThrow();
  });

  it("requires every independently verified eligibility gate", () => {
    const noDocuments = evaluateSupportPaymentReadiness({
      ...readyInput(),
      verifiedDocumentCount: 1,
    });
    expect(noDocuments.missing).toContain("REQUIRED_DOCUMENTS");

    const unverifiedBank = evaluateSupportPaymentReadiness({
      ...readyInput(),
      bankVerifiedAt: null,
    });
    expect(unverifiedBank.missing).toContain("VERIFIED_NOMINEE_BANK_DETAILS");

    const dispute = evaluateSupportPaymentReadiness({ ...readyInput(), disputeOpen: true });
    expect(dispute.missing).toContain("OPEN_NOMINEE_DISPUTE");

    const unpublished = evaluateSupportPaymentReadiness({
      ...readyInput(),
      eventStatus: "APPROVED",
      eventPublishedAt: null,
    });
    expect(unpublished.missing).toEqual(expect.arrayContaining(["PUBLISHED_DEATH_SUPPORT_EVENT"]));
  });

  it("requires all restricted evidence records, not a loose document count", () => {
    expect(hasCompleteRequiredSupportDocuments(0, 0, reviewedAt)).toBe(false);
    expect(hasCompleteRequiredSupportDocuments(2, 1, reviewedAt)).toBe(false);
    expect(hasCompleteRequiredSupportDocuments(2, 2, null)).toBe(false);
    expect(hasCompleteRequiredSupportDocuments(2, 2, reviewedAt)).toBe(true);
  });

  it("permits a Primary nominee and requires an audited reason for Secondary or Backup", () => {
    expect(() =>
      assertNomineeSelectionAllowed({
        kind: "PRIMARY",
        status: "VERIFIED",
        isCurrent: true,
        hasEncryptedBankDetails: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertNomineeSelectionAllowed({
        kind: "SECONDARY",
        status: "VERIFIED",
        isCurrent: true,
        hasEncryptedBankDetails: true,
      }),
    ).toThrow("reason");
    expect(() =>
      assertNomineeSelectionAllowed(
        {
          kind: "BACKUP",
          status: "VERIFIED",
          isCurrent: true,
          hasEncryptedBankDetails: true,
        },
        "Primary nominee is deceased",
      ),
    ).not.toThrow();
    expect(() =>
      assertNomineeSelectionAllowed({
        kind: "PRIMARY",
        status: "PENDING_VERIFICATION",
        isCurrent: true,
        hasEncryptedBankDetails: true,
      }),
    ).toThrow("current and verified");
  });

  it("restores a frozen payout only through a reviewable status", () => {
    expect(restoreStatusAfterResolvedDispute("REVIEW")).toBe("REVIEW");
    expect(restoreStatusAfterResolvedDispute("APPROVED")).toBe("APPROVED");
    // A frozen pending transfer never resumes automatically; an Admin must
    // initiate a new transfer command after the dispute is resolved.
    expect(restoreStatusAfterResolvedDispute("PAYMENT_PENDING")).toBe("APPROVED");
    expect(restoreStatusAfterResolvedDispute("PAYMENT_FAILED")).toBe("PAYMENT_FAILED");
  });

  it("has no configured fake payout provider", () => {
    expect(getSupportTransferProvider({})).toEqual({
      available: false,
      reason: "NOT_CONFIGURED",
    });
    expect(getSupportTransferProvider({ SUPPORT_TRANSFER_PROVIDER: "unknown" })).toEqual({
      available: false,
      reason: "UNSUPPORTED_PROVIDER",
    });
  });
});
