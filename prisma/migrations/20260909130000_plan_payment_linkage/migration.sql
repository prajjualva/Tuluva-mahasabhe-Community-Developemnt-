-- A plan registration due must point to its plan so payment settlement cannot
-- advance an unrelated plan. Existing development data has no plan records.
ALTER TABLE "community_support_plans"
  ADD COLUMN "externalId" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "dues" ADD COLUMN "planId" UUID;

CREATE UNIQUE INDEX "community_support_plans_externalId_key"
  ON "community_support_plans"("externalId");
CREATE INDEX "dues_planId_status_idx" ON "dues"("planId", "status");
ALTER TABLE "dues" ADD CONSTRAINT "dues_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "community_support_plans"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
