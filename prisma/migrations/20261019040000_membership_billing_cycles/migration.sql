ALTER TABLE "members" ADD COLUMN "membershipBillingAnchor" TIMESTAMP(3);
UPDATE "members" SET "membershipBillingAnchor" = "joinedAt";
ALTER TABLE "community_support_plans" ADD COLUMN "isReopening" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "dues" ADD COLUMN "billingCycleKey" TEXT;
-- Only identify the original membership bill. Historical records remain intact.
UPDATE "dues" d SET "billingCycleKey" = 'membership:' || d."memberId"::text || ':' || floor(extract(epoch FROM m."membershipBillingAnchor") * 1000)::bigint::text || ':0'
FROM "members" m WHERE m.id = d."memberId" AND d.id = (
 SELECT original.id FROM "dues" original WHERE original."memberId" = d."memberId" AND original.purpose = 'MEMBERSHIP' ORDER BY original."createdAt", original.id LIMIT 1
);
CREATE UNIQUE INDEX "dues_billingCycleKey_key" ON "dues"("billingCycleKey");
