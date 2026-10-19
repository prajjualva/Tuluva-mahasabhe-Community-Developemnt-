CREATE TABLE "ledger_adjustments" (
 "id" UUID PRIMARY KEY,
 "externalId" UUID NOT NULL,
 "amountPaise" INTEGER NOT NULL CHECK ("amountPaise" > 0),
 "purpose" TEXT NOT NULL,
 "reference" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
 "evidenceBytes" BYTEA NOT NULL,
 "contentType" TEXT NOT NULL,
 "idempotencyKey" TEXT NOT NULL,
 "commandHash" TEXT NOT NULL,
 "requestedBy" UUID NOT NULL,
 "approvedBy" UUID,
 "decisionReason" TEXT,
 "decidedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ledger_adjustments_externalId_key" ON "ledger_adjustments"("externalId");
CREATE UNIQUE INDEX "ledger_adjustments_reference_key" ON "ledger_adjustments"("reference");
CREATE UNIQUE INDEX "ledger_adjustments_idempotencyKey_key" ON "ledger_adjustments"("idempotencyKey");
