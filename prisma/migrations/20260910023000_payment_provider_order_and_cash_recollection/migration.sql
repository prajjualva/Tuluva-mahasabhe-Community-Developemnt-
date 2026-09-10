-- A provider order and a captured provider payment are distinct immutable
-- reconciliation values. Keeping both makes webhook delivery safely replayable.
ALTER TABLE "payments" ADD COLUMN "providerOrderId" TEXT;

-- Pending online records from the previous representation stored their order
-- in providerReference. Preserve them before the application starts writing
-- captured payment references there.
UPDATE "payments"
SET "providerOrderId" = "providerReference"
WHERE "method" = 'ONLINE' AND "status" = 'PENDING' AND "providerReference" IS NOT NULL;

CREATE UNIQUE INDEX "payments_providerOrderId_key"
  ON "payments"("providerOrderId");
