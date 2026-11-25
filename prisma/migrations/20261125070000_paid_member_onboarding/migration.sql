-- AlterTable
ALTER TABLE "members" ADD COLUMN     "registrationDueId" UUID;

-- CreateTable
CREATE TABLE "membership_packs" (
    "id" UUID NOT NULL,
    "externalId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "paymentId" UUID,
    "grantId" UUID,
    "certificateNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "mobile" TEXT,
    "photoBytes" BYTEA,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "testOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "membership_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_grants" (
    "id" UUID NOT NULL,
    "externalId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "approvedById" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_packs_externalId_key" ON "membership_packs"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_packs_paymentId_key" ON "membership_packs"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_packs_grantId_key" ON "membership_packs"("grantId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_packs_certificateNumber_key" ON "membership_packs"("certificateNumber");

-- CreateIndex
CREATE INDEX "membership_packs_memberId_issuedAt_idx" ON "membership_packs"("memberId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "membership_grants_externalId_key" ON "membership_grants"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_grants_memberId_key" ON "membership_grants"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_grants_idempotencyKey_key" ON "membership_grants"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "members_registrationDueId_key" ON "members"("registrationDueId");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_registrationDueId_fkey" FOREIGN KEY ("registrationDueId") REFERENCES "dues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Each issued pack has exactly one truthful basis: verified funds or an Admin grant.
ALTER TABLE "membership_packs" ADD CONSTRAINT "membership_packs_single_basis"
CHECK (("paymentId" IS NOT NULL)::integer + ("grantId" IS NOT NULL)::integer = 1);

-- AddForeignKey
ALTER TABLE "membership_packs" ADD CONSTRAINT "membership_packs_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_packs" ADD CONSTRAINT "membership_packs_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_packs" ADD CONSTRAINT "membership_packs_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "membership_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_grants" ADD CONSTRAINT "membership_grants_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_grants" ADD CONSTRAINT "membership_grants_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

