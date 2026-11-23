-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('NEWS_COMMENT', 'EVENT_COMMENT');

-- CreateEnum
CREATE TYPE "ContentReportStatus" AS ENUM ('OPEN', 'REMOVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "content_reports" (
    "externalId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "kind" "ContentKind" NOT NULL,
    "commentExternalId" UUID NOT NULL,
    "parentExternalId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ContentReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" UUID,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("externalId")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "externalId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "blockedUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("externalId")
);

-- CreateIndex
CREATE INDEX "content_reports_status_createdAt_idx" ON "content_reports"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_reports_reporterId_kind_commentExternalId_key" ON "content_reports"("reporterId", "kind", "commentExternalId");

-- CreateIndex
CREATE INDEX "user_blocks_blockedUserId_idx" ON "user_blocks"("blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "user_blocks_ownerId_blockedUserId_key" ON "user_blocks"("ownerId", "blockedUserId");

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
