ALTER TABLE "cash_collections"
  ADD COLUMN "externalId" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "dueId" UUID,
  ADD COLUMN "paymentId" UUID;

UPDATE "cash_collections" SET "dueId" = id, "paymentId" = id WHERE "dueId" IS NULL;

ALTER TABLE "cash_collections"
  ALTER COLUMN "dueId" SET NOT NULL,
  ALTER COLUMN "paymentId" SET NOT NULL;

CREATE UNIQUE INDEX "cash_collections_externalId_key" ON "cash_collections"("externalId");
CREATE UNIQUE INDEX "cash_collections_dueId_key" ON "cash_collections"("dueId");
CREATE UNIQUE INDEX "cash_collections_paymentId_key" ON "cash_collections"("paymentId");
