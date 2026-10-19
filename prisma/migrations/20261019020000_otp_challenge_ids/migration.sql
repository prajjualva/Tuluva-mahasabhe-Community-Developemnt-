ALTER TABLE "otp_challenges" ADD COLUMN "externalId" UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX "otp_challenges_externalId_key" ON "otp_challenges"("externalId");
CREATE UNIQUE INDEX "nominee_one_verified_current_primary" ON "nominees"("memberId") WHERE kind = 'PRIMARY' AND "isCurrent" = true AND status = 'VERIFIED';
