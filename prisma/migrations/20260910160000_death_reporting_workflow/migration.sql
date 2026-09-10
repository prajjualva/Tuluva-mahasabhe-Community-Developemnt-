-- Phase 7: private death reports, public support events, evidence metadata,
-- moderated condolences, and append-only event-cancellation reversals.

CREATE TYPE "DeathEventStatus" AS ENUM ('APPROVED', 'PUBLISHED', 'CLOSED', 'CANCELLED');
CREATE TYPE "DeathEligibilityStatus" AS ENUM ('PENDING', 'ELIGIBLE', 'INELIGIBLE', 'ADMIN_REVIEW');
CREATE TYPE "EventCancellationSettlementMethod" AS ENUM ('ORIGINAL_METHOD', 'FOUNDATION_WALLET');
CREATE TYPE "EventContributionReversalStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "CommentStatus" AS ENUM ('PUBLISHED', 'MODERATED');

ALTER TABLE "death_cases"
  ADD COLUMN "reporterAccessTokenHash" TEXT,
  ADD COLUMN "requiresAdminReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "eligibilityStatus" "DeathEligibilityStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "eligibilityReason" TEXT,
  ADD COLUMN "verifiedNomineeId" UUID,
  ADD COLUMN "coordinatorConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "coordinatorConfirmedById" UUID,
  ADD COLUMN "adminVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "adminVerifiedById" UUID,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "death_cases_reporterAccessTokenHash_key"
  ON "death_cases"("reporterAccessTokenHash");
CREATE INDEX "death_cases_memberId_status_createdAt_idx"
  ON "death_cases"("memberId", "status", "createdAt");
CREATE INDEX "death_cases_status_requiresAdminReview_createdAt_idx"
  ON "death_cases"("status", "requiresAdminReview", "createdAt");
-- At most one unresolved report may exist for a member. This protects the
-- approved-event/contribution pipeline even under concurrent public reports.
CREATE UNIQUE INDEX "death_cases_open_member_unique"
  ON "death_cases"("memberId")
  WHERE "memberId" IS NOT NULL AND "status" NOT IN ('REJECTED', 'CANCELLED');

ALTER TABLE "death_documents"
  ADD COLUMN "externalId" UUID,
  ADD COLUMN "originalFilename" TEXT NOT NULL DEFAULT 'uploaded-document',
  ADD COLUMN "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "death_documents" SET "externalId" = "id" WHERE "externalId" IS NULL;
ALTER TABLE "death_documents" ALTER COLUMN "externalId" SET NOT NULL;
CREATE UNIQUE INDEX "death_documents_externalId_key" ON "death_documents"("externalId");
CREATE INDEX "death_documents_deathCaseId_uploadedAt_idx"
  ON "death_documents"("deathCaseId", "uploadedAt");

ALTER TABLE "contribution_events"
  ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "contribution_events"
  ALTER COLUMN "status" TYPE "DeathEventStatus"
  USING (
    CASE
      WHEN "publishedAt" IS NOT NULL THEN 'PUBLISHED'
      WHEN "status"::text = 'CLOSED' THEN 'CLOSED'
      WHEN "status"::text IN ('CANCELLED', 'REJECTED') THEN 'CANCELLED'
      ELSE 'APPROVED'
    END
  )::"DeathEventStatus";
ALTER TABLE "contribution_events"
  ALTER COLUMN "status" SET DEFAULT 'APPROVED',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "publicDetails" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" UUID,
  ADD COLUMN "publishedById" UUID,
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "closedById" UUID,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" UUID,
  ADD COLUMN "cancellationReason" TEXT;

ALTER TABLE "comments"
  ADD COLUMN "externalId" UUID,
  ADD COLUMN "status" "CommentStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "moderatedById" UUID,
  ADD COLUMN "moderationReason" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "comments" SET "externalId" = "id" WHERE "externalId" IS NULL;
ALTER TABLE "comments" ALTER COLUMN "externalId" SET NOT NULL;
CREATE UNIQUE INDEX "comments_externalId_key" ON "comments"("externalId");
CREATE INDEX "comments_eventId_status_createdAt_idx" ON "comments"("eventId", "status", "createdAt");

CREATE TABLE "contribution_event_cancellations" (
  "id" UUID NOT NULL,
  "externalId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "settlementMethod" "EventCancellationSettlementMethod" NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contribution_event_cancellations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contribution_event_reversals" (
  "id" UUID NOT NULL,
  "externalId" UUID NOT NULL,
  "cancellationId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "refundId" UUID,
  "memberId" UUID NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "method" "EventCancellationSettlementMethod" NOT NULL,
  "status" "EventContributionReversalStatus" NOT NULL DEFAULT 'PENDING',
  "failureReason" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contribution_event_reversals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contribution_event_cancellations_externalId_key"
  ON "contribution_event_cancellations"("externalId");
CREATE UNIQUE INDEX "contribution_event_cancellations_eventId_key"
  ON "contribution_event_cancellations"("eventId");
CREATE UNIQUE INDEX "contribution_event_reversals_externalId_key"
  ON "contribution_event_reversals"("externalId");
CREATE UNIQUE INDEX "contribution_event_reversals_paymentId_key"
  ON "contribution_event_reversals"("paymentId");
CREATE UNIQUE INDEX "contribution_event_reversals_refundId_key"
  ON "contribution_event_reversals"("refundId");
CREATE INDEX "contribution_event_reversals_cancellationId_status_idx"
  ON "contribution_event_reversals"("cancellationId", "status");

ALTER TABLE "death_cases"
  ADD CONSTRAINT "death_cases_verifiedNomineeId_fkey"
  FOREIGN KEY ("verifiedNomineeId") REFERENCES "nominees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comments"
  ADD CONSTRAINT "comments_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "contribution_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "comments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contribution_event_cancellations"
  ADD CONSTRAINT "contribution_event_cancellations_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "contribution_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contribution_event_reversals"
  ADD CONSTRAINT "contribution_event_reversals_cancellationId_fkey"
  FOREIGN KEY ("cancellationId") REFERENCES "contribution_event_cancellations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "contribution_event_reversals_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "contribution_event_reversals_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "payment_refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
