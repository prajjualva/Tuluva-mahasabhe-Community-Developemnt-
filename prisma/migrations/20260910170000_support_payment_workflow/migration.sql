-- Phase 8: persistent ₹1,00,000 Community Support payout review, nominee,
-- document, dispute, and manual/transfer settlement workflow.  This migration
-- preserves legacy support records, but separates their lifecycle from the
-- private death-report status so a public death event can never imply payout.

CREATE TYPE "SupportCaseStatus" AS ENUM (
  'REVIEW',
  'APPROVED',
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
  'PAID',
  'REJECTED',
  'FROZEN_DISPUTE'
);

CREATE TYPE "SupportDisputeStatus" AS ENUM ('OPEN', 'RESOLVED');

-- Nominee IDs become safe external identifiers. Existing UUID primary keys are
-- copied once so historical nominee links remain stable without exposing a
-- database-only integer or a sensitive field.
ALTER TABLE "nominees" ADD COLUMN "externalId" UUID;
UPDATE "nominees" SET "externalId" = "id" WHERE "externalId" IS NULL;
ALTER TABLE "nominees"
  ALTER COLUMN "externalId" SET NOT NULL,
  ALTER COLUMN "externalId" SET DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX "nominees_externalId_key" ON "nominees"("externalId");

-- Add durable external IDs and immutable amount snapshots before converting
-- the overloaded legacy status enum. The ₹1,00,000 default only backfills
-- historical rows; new cases obtain their amount from the effective scheme
-- setting in the application transaction.
ALTER TABLE "support_cases"
  ADD COLUMN "externalId" UUID,
  ADD COLUMN "amountPaise" INTEGER,
  ADD COLUMN "eligibilitySnapshot" JSONB,
  ADD COLUMN "nomineeSelectionReason" TEXT,
  ADD COLUMN "nomineeVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "nomineeVerifiedById" UUID,
  ADD COLUMN "bankVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "bankVerifiedById" UUID,
  ADD COLUMN "documentsVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "documentsVerifiedById" UUID,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" UUID,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedById" UUID,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "frozenAt" TIMESTAMP(3),
  ADD COLUMN "statusBeforeFreeze" "SupportCaseStatus",
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "support_cases"
SET
  "externalId" = "id",
  "amountPaise" = 10000000
WHERE "externalId" IS NULL OR "amountPaise" IS NULL;
ALTER TABLE "support_cases"
  ALTER COLUMN "externalId" SET NOT NULL,
  ALTER COLUMN "externalId" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "amountPaise" SET NOT NULL;
CREATE UNIQUE INDEX "support_cases_externalId_key" ON "support_cases"("externalId");
-- New and changed payout cases are fixed at ₹1,00,000. NOT VALID avoids
-- making an older, pre-Phase-8 historical record block deployment while still
-- enforcing the invariant for all future writes.
ALTER TABLE "support_cases"
  ADD CONSTRAINT "support_cases_amount_fixed_check"
  CHECK ("amountPaise" = 10000000) NOT VALID;

ALTER TABLE "support_cases" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "support_cases"
  ALTER COLUMN "status" TYPE "SupportCaseStatus"
  USING (
    CASE "status"::text
      WHEN 'PAID' THEN 'PAID'
      WHEN 'REJECTED' THEN 'REJECTED'
      WHEN 'SUPPORT_PAYMENT_PENDING' THEN 'PAYMENT_PENDING'
      WHEN 'APPROVED' THEN 'APPROVED'
      WHEN 'CANCELLED' THEN 'REVIEW'
      ELSE 'REVIEW'
    END
  )::"SupportCaseStatus";
ALTER TABLE "support_cases" ALTER COLUMN "status" SET DEFAULT 'REVIEW';
CREATE INDEX "support_cases_status_createdAt_idx" ON "support_cases"("status", "createdAt");
CREATE INDEX "support_cases_nomineeId_idx" ON "support_cases"("nomineeId");

ALTER TABLE "support_payments"
  ADD COLUMN "externalId" UUID,
  ADD COLUMN "method" TEXT NOT NULL DEFAULT 'MANUAL_BANK_TRANSFER',
  ADD COLUMN "providerName" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "initiatedById" UUID,
  ADD COLUMN "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "settledAt" TIMESTAMP(3);
UPDATE "support_payments"
SET
  "externalId" = "id",
  "idempotencyKey" = 'legacy-support-payment:' || "id"::text
WHERE "externalId" IS NULL OR "idempotencyKey" IS NULL;
ALTER TABLE "support_payments"
  ALTER COLUMN "externalId" SET NOT NULL,
  ALTER COLUMN "externalId" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX "support_payments_externalId_key" ON "support_payments"("externalId");
CREATE UNIQUE INDEX "support_payments_idempotencyKey_key" ON "support_payments"("idempotencyKey");
-- Multiple attempts may be waiting for a reference, but a real transfer
-- reference may settle exactly one attempt.
CREATE UNIQUE INDEX "support_payments_providerReference_unique"
  ON "support_payments"("providerReference")
  WHERE "providerReference" IS NOT NULL;
CREATE INDEX "support_payments_supportCaseId_status_initiatedAt_idx"
  ON "support_payments"("supportCaseId", "status", "initiatedAt");
ALTER TABLE "support_payments"
  ADD CONSTRAINT "support_payments_amount_fixed_check"
  CHECK ("amountPaise" = 10000000) NOT VALID;

CREATE TABLE "support_disputes" (
  "id" UUID NOT NULL,
  "externalId" UUID NOT NULL,
  "supportCaseId" UUID NOT NULL,
  "status" "SupportDisputeStatus" NOT NULL DEFAULT 'OPEN',
  "reason" TEXT NOT NULL,
  "openedById" UUID,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedById" UUID,
  "resolvedAt" TIMESTAMP(3),
  "resolution" TEXT,

  CONSTRAINT "support_disputes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "support_disputes_externalId_key" ON "support_disputes"("externalId");
CREATE UNIQUE INDEX "support_disputes_open_case_unique"
  ON "support_disputes"("supportCaseId") WHERE "status" = 'OPEN';
CREATE INDEX "support_disputes_supportCaseId_status_openedAt_idx"
  ON "support_disputes"("supportCaseId", "status", "openedAt");

CREATE TABLE "support_document_verifications" (
  "id" UUID NOT NULL,
  "supportCaseId" UUID NOT NULL,
  "deathDocumentId" UUID NOT NULL,
  "verifiedById" UUID,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "support_document_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "support_document_verifications_case_document_key"
  ON "support_document_verifications"("supportCaseId", "deathDocumentId");
CREATE INDEX "support_document_verifications_supportCaseId_verifiedAt_idx"
  ON "support_document_verifications"("supportCaseId", "verifiedAt");

ALTER TABLE "support_cases"
  ADD CONSTRAINT "support_cases_nomineeId_fkey"
  FOREIGN KEY ("nomineeId") REFERENCES "nominees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_disputes"
  ADD CONSTRAINT "support_disputes_supportCaseId_fkey"
  FOREIGN KEY ("supportCaseId") REFERENCES "support_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_document_verifications"
  ADD CONSTRAINT "support_document_verifications_supportCaseId_fkey"
  FOREIGN KEY ("supportCaseId") REFERENCES "support_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "support_document_verifications_deathDocumentId_fkey"
  FOREIGN KEY ("deathDocumentId") REFERENCES "death_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
