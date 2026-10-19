-- Additive migration: retain existing collections, receipts and ledger records.
ALTER TABLE "cash_collections" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "cash_collections" c SET "createdAt" = p."createdAt" FROM "payments" p WHERE c."paymentId" = p.id;
ALTER TABLE "cash_deposits"
 ADD COLUMN "externalId" UUID NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN "bankReference" TEXT,
 ADD COLUMN "idempotencyKey" TEXT,
 ADD COLUMN "commandHash" TEXT,
 ADD COLUMN "evidenceBytes" BYTEA,
 ADD COLUMN "contentType" TEXT,
 ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING',
 ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "verifiedAt" TIMESTAMP(3),
 ADD COLUMN "verifiedBy" UUID,
 ADD COLUMN "decisionHash" TEXT,
 ADD COLUMN "reason" TEXT;
CREATE UNIQUE INDEX "cash_deposits_externalId_key" ON "cash_deposits"("externalId");
CREATE UNIQUE INDEX "cash_deposits_bankReference_key" ON "cash_deposits"("bankReference");
CREATE UNIQUE INDEX "cash_deposits_idempotencyKey_key" ON "cash_deposits"("idempotencyKey");
ALTER TABLE "cash_discrepancies"
 ADD COLUMN "externalId" UUID NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN "amountPaise" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "deadlineAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '30 days'),
 ADD COLUMN "resolvedAt" TIMESTAMP(3),
 ADD COLUMN "escalatedAt" TIMESTAMP(3);
UPDATE "cash_discrepancies" d SET "amountPaise" = c."amountPaise" FROM "cash_collections" c WHERE d."cashCollectionId" = c.id AND d.status = 'UNRESOLVED';
CREATE UNIQUE INDEX "cash_discrepancies_externalId_key" ON "cash_discrepancies"("externalId");
CREATE INDEX "cash_discrepancies_status_deadlineAt_idx" ON "cash_discrepancies"("status", "deadlineAt");
ALTER TABLE "cash_discrepancies" ADD CONSTRAINT "cash_discrepancies_cashCollectionId_fkey" FOREIGN KEY ("cashCollectionId") REFERENCES "cash_collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "cash_deposit_allocations" (
 "id" UUID PRIMARY KEY,
 "depositId" UUID NOT NULL REFERENCES "cash_deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "cashCollectionId" UUID NOT NULL REFERENCES "cash_collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "expectedAmountPaise" INTEGER NOT NULL CHECK ("expectedAmountPaise" > 0),
 "receivedAmountPaise" INTEGER CHECK ("receivedAmountPaise" >= 0 AND "receivedAmountPaise" <= "expectedAmountPaise")
);
CREATE UNIQUE INDEX "cash_deposit_allocations_depositId_cashCollectionId_key" ON "cash_deposit_allocations"("depositId", "cashCollectionId");
CREATE INDEX "cash_deposit_allocations_cashCollectionId_idx" ON "cash_deposit_allocations"("cashCollectionId");
CREATE TABLE "cash_receipt_counters" ("year" INTEGER PRIMARY KEY, "value" INTEGER NOT NULL CHECK ("value" > 0));
INSERT INTO "cash_receipt_counters" (year, value)
SELECT split_part("receiptNumber", '-', 2)::integer, max(split_part("receiptNumber", '-', 3)::integer)
FROM "cash_collections" WHERE "receiptNumber" ~ '^(CASH|MANUAL)-[0-9]{4}-[0-9]{6}$'
GROUP BY split_part("receiptNumber", '-', 2)::integer;
ALTER TABLE "foundation_ledger" ADD COLUMN "externalId" UUID NOT NULL DEFAULT gen_random_uuid(), ADD COLUMN "supportingDepositId" UUID;
CREATE UNIQUE INDEX "foundation_ledger_externalId_key" ON "foundation_ledger"("externalId");
ALTER TABLE "foundation_ledger" ADD CONSTRAINT "foundation_ledger_supportingDepositId_fkey" FOREIGN KEY ("supportingDepositId") REFERENCES "cash_deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coordinator_lifecycle_events" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "coordinator_transfer_history" ALTER COLUMN "actorId" DROP NOT NULL;
INSERT INTO "scheme_settings" (id, key) VALUES (gen_random_uuid(), 'cashDiscrepancyResolutionDays') ON CONFLICT (key) DO NOTHING;
INSERT INTO "scheme_setting_versions" (id, "settingId", value, "effectiveFrom", "createdAt")
SELECT gen_random_uuid(), id, '30'::jsonb, '2026-01-01'::timestamp, CURRENT_TIMESTAMP FROM "scheme_settings" WHERE key = 'cashDiscrepancyResolutionDays'
ON CONFLICT ("settingId", "effectiveFrom") DO NOTHING;
