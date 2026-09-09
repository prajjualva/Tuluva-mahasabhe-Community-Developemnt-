-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'GRACE', 'INACTIVE', 'CLOSED', 'DECEASED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('NOT_REGISTERED', 'PENDING_COORDINATOR_APPROVAL', 'PENDING_ADMIN_APPROVAL', 'PAYMENT_PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DueStatus" AS ENUM ('PENDING', 'OVERDUE', 'EXPIRED', 'PAID', 'CANCELLED', 'WAIVED');

-- CreateEnum
CREATE TYPE "DeathCaseStatus" AS ENUM ('REPORTED', 'COORDINATOR_CONFIRMED', 'ADMIN_VERIFICATION', 'APPROVED', 'REJECTED', 'SUPPORT_PAYMENT_PENDING', 'PAID', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NomineeStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CashStatus" AS ENUM ('RECEIVED_BY_COORDINATOR', 'PENDING_ADMIN_VERIFICATION', 'PAID', 'REJECTED', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "AutopayStatus" AS ENUM ('NOT_SET', 'ACTIVE', 'FAILED', 'EXPIRED', 'REVOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE', 'WALLET', 'CASH', 'MANUAL');

-- CreateEnum
CREATE TYPE "WalletDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CoordinatorStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "externalId" UUID NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "mobileVerifiedAt" TIMESTAMP(3),
    "pendingEmail" TEXT,
    "pendingMobile" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgentHash" TEXT,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "destination" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "externalId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "coordinatorId" UUID,
    "fullName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "deceasedAt" TIMESTAMP(3),

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coordinators" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "referralCode" TEXT NOT NULL,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "status" "CoordinatorStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedAt" TIMESTAMP(3),

    CONSTRAINT "coordinators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coordinator_lifecycle_events" (
    "id" UUID NOT NULL,
    "coordinatorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "coordinatorId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coordinator_transfer_history" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "fromCoordinatorId" UUID,
    "toCoordinatorId" UUID,
    "reason" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID NOT NULL,

    CONSTRAINT "coordinator_transfer_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_periods" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "membership_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_support_plans" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
    "activatedAt" TIMESTAMP(3),
    "waitingEndsAt" TIMESTAMP(3),

    CONSTRAINT "community_support_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nominees" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "bankEncrypted" JSONB,
    "status" "NomineeStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "replacesNomineeId" UUID,
    "contactDetails" JSONB,
    "identificationEncrypted" JSONB,

    CONSTRAINT "nominees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nominee_verifications" (
    "id" UUID NOT NULL,
    "nomineeId" UUID NOT NULL,
    "status" "NomineeStatus" NOT NULL,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "nominee_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nominee_documents" (
    "id" UUID NOT NULL,
    "nomineeId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,

    CONSTRAINT "nominee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "death_cases" (
    "id" UUID NOT NULL,
    "externalId" UUID NOT NULL,
    "memberId" UUID,
    "reporterIdentity" TEXT NOT NULL,
    "placeOfDeath" TEXT NOT NULL,
    "dateOfDeath" TIMESTAMP(3) NOT NULL,
    "details" TEXT,
    "status" "DeathCaseStatus" NOT NULL DEFAULT 'REPORTED',

    CONSTRAINT "death_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "death_documents" (
    "id" UUID NOT NULL,
    "deathCaseId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sensitivity" TEXT NOT NULL DEFAULT 'RESTRICTED',

    CONSTRAINT "death_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contribution_events" (
    "id" UUID NOT NULL,
    "externalId" UUID NOT NULL,
    "deathCaseId" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "status" "DeathCaseStatus" NOT NULL DEFAULT 'APPROVED',

    CONSTRAINT "contribution_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "dueId" UUID,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dues" (
    "id" UUID NOT NULL,
    "externalId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "DueStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "dues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "externalId" UUID NOT NULL,
    "memberId" UUID,
    "dueId" UUID,
    "amountPaise" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhooks" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "payment_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_mandates" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "providerReference" TEXT NOT NULL,
    "status" "AutopayStatus" NOT NULL DEFAULT 'NOT_SET',

    CONSTRAINT "payment_mandates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "balancePaise" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "direction" "WalletDirection" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "balanceAfterPaise" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "relatedExternalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_cases" (
    "id" UUID NOT NULL,
    "deathCaseId" UUID NOT NULL,
    "nomineeId" UUID,
    "status" "DeathCaseStatus" NOT NULL DEFAULT 'SUPPORT_PAYMENT_PENDING',
    "exceptionReason" TEXT,

    CONSTRAINT "support_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_payments" (
    "id" UUID NOT NULL,
    "supportCaseId" UUID NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,

    CONSTRAINT "support_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foundation_ledger" (
    "id" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "relatedExternalId" TEXT,
    "authorizedActorId" UUID,
    "reference" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foundation_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_collections" (
    "id" UUID NOT NULL,
    "coordinatorId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "status" "CashStatus" NOT NULL DEFAULT 'RECEIVED_BY_COORDINATOR',

    CONSTRAINT "cash_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_deposits" (
    "id" UUID NOT NULL,
    "coordinatorId" UUID NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,

    CONSTRAINT "cash_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_discrepancies" (
    "id" UUID NOT NULL,
    "cashCollectionId" UUID NOT NULL,
    "status" "CashStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "reason" TEXT NOT NULL,

    CONSTRAINT "cash_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_news" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "status" "NewsStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" UUID,
    "approvedById" UUID,
    "rejectionReason" TEXT,

    CONSTRAINT "community_news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "moderatedAt" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "reason" TEXT,
    "requestId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheme_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "activeVersionId" UUID,

    CONSTRAINT "scheme_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheme_setting_versions" (
    "id" UUID NOT NULL,
    "settingId" UUID NOT NULL,
    "value" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheme_setting_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_externalId_key" ON "users"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_key" ON "users"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "users_pendingEmail_key" ON "users"("pendingEmail");

-- CreateIndex
CREATE UNIQUE INDEX "users_pendingMobile_key" ON "users"("pendingMobile");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_expiresAt_idx" ON "auth_sessions"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "otp_challenges_destination_purpose_createdAt_idx" ON "otp_challenges"("destination", "purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_tokenHash_key" ON "password_resets"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "members_externalId_key" ON "members"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "members_userId_key" ON "members"("userId");

-- CreateIndex
CREATE INDEX "members_status_idx" ON "members"("status");

-- CreateIndex
CREATE INDEX "members_coordinatorId_idx" ON "members"("coordinatorId");

-- CreateIndex
CREATE UNIQUE INDEX "coordinators_memberId_key" ON "coordinators"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "coordinators_referralCode_key" ON "coordinators"("referralCode");

-- CreateIndex
CREATE INDEX "coordinators_isSuspended_idx" ON "coordinators"("isSuspended");

-- CreateIndex
CREATE INDEX "coordinator_lifecycle_events_coordinatorId_createdAt_idx" ON "coordinator_lifecycle_events"("coordinatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_memberId_key" ON "referrals"("memberId");

-- CreateIndex
CREATE INDEX "coordinator_transfer_history_memberId_effectiveAt_idx" ON "coordinator_transfer_history"("memberId", "effectiveAt");

-- CreateIndex
CREATE INDEX "community_support_plans_memberId_status_idx" ON "community_support_plans"("memberId", "status");

-- CreateIndex
CREATE INDEX "nominees_memberId_status_idx" ON "nominees"("memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "nominee_documents_storageKey_key" ON "nominee_documents"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "death_cases_externalId_key" ON "death_cases"("externalId");

-- CreateIndex
CREATE INDEX "death_cases_memberId_status_idx" ON "death_cases"("memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "death_documents_storageKey_key" ON "death_documents"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "contribution_events_externalId_key" ON "contribution_events"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "contribution_events_deathCaseId_key" ON "contribution_events"("deathCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_dueId_key" ON "contributions"("dueId");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_eventId_memberId_key" ON "contributions"("eventId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "dues_externalId_key" ON "dues"("externalId");

-- CreateIndex
CREATE INDEX "dues_memberId_status_dueAt_idx" ON "dues"("memberId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_externalId_key" ON "payments"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerReference_key" ON "payments"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_status_createdAt_idx" ON "payments"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhooks_provider_providerEventId_key" ON "payment_webhooks"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_mandates_providerReference_key" ON "payment_mandates"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_paymentId_key" ON "receipts"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receiptNumber_key" ON "receipts"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_memberId_key" ON "wallets"("memberId");

-- CreateIndex
CREATE INDEX "wallet_transactions_walletId_createdAt_idx" ON "wallet_transactions"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_cases_deathCaseId_key" ON "support_cases"("deathCaseId");

-- CreateIndex
CREATE INDEX "foundation_ledger_createdAt_direction_idx" ON "foundation_ledger"("createdAt", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "cash_collections_receiptNumber_key" ON "cash_collections"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "cash_discrepancies_cashCollectionId_key" ON "cash_discrepancies"("cashCollectionId");

-- CreateIndex
CREATE INDEX "notifications_userId_sentAt_idx" ON "notifications"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "scheme_settings_key_key" ON "scheme_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "scheme_settings_activeVersionId_key" ON "scheme_settings"("activeVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "scheme_setting_versions_settingId_effectiveFrom_key" ON "scheme_setting_versions"("settingId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "coordinators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordinators" ADD CONSTRAINT "coordinators_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordinator_lifecycle_events" ADD CONSTRAINT "coordinator_lifecycle_events_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "coordinators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "coordinators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordinator_transfer_history" ADD CONSTRAINT "coordinator_transfer_history_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_support_plans" ADD CONSTRAINT "community_support_plans_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominees" ADD CONSTRAINT "nominees_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominee_verifications" ADD CONSTRAINT "nominee_verifications_nomineeId_fkey" FOREIGN KEY ("nomineeId") REFERENCES "nominees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominee_verifications" ADD CONSTRAINT "nominee_verifications_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominee_documents" ADD CONSTRAINT "nominee_documents_nomineeId_fkey" FOREIGN KEY ("nomineeId") REFERENCES "nominees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "death_cases" ADD CONSTRAINT "death_cases_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "death_documents" ADD CONSTRAINT "death_documents_deathCaseId_fkey" FOREIGN KEY ("deathCaseId") REFERENCES "death_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_deathCaseId_fkey" FOREIGN KEY ("deathCaseId") REFERENCES "death_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "contribution_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dues" ADD CONSTRAINT "dues_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_dueId_fkey" FOREIGN KEY ("dueId") REFERENCES "dues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_deathCaseId_fkey" FOREIGN KEY ("deathCaseId") REFERENCES "death_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_payments" ADD CONSTRAINT "support_payments_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "support_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_collections" ADD CONSTRAINT "cash_collections_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "coordinators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_setting_versions" ADD CONSTRAINT "scheme_setting_versions_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "scheme_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
