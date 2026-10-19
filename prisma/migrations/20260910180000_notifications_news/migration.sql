-- Phase 9: durable in-app notification inbox, scoped community news, and
-- independently moderated news comments. Existing notification rows retain
-- their legacy template/payload metadata and receive safe public identifiers.

-- Coordinator external IDs allow assignment and suspension APIs to avoid
-- exposing database-only keys while emitting the corresponding notifications.
ALTER TABLE "coordinators" ADD COLUMN "externalId" UUID;
UPDATE "coordinators" SET "externalId" = "id" WHERE "externalId" IS NULL;
ALTER TABLE "coordinators"
  ALTER COLUMN "externalId" SET NOT NULL,
  ALTER COLUMN "externalId" SET DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX "coordinators_externalId_key" ON "coordinators"("externalId");

ALTER TABLE "notifications"
  ADD COLUMN "externalId" UUID,
  ADD COLUMN "type" TEXT NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "title" TEXT NOT NULL DEFAULT 'Community Support Foundation',
  ADD COLUMN "body" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "relatedExternalId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "readAt" TIMESTAMP(3),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "notifications"
SET "externalId" = "id"
WHERE "externalId" IS NULL;

ALTER TABLE "notifications"
  ALTER COLUMN "externalId" SET NOT NULL,
  ALTER COLUMN "externalId" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "channel" SET DEFAULT 'IN_APP';

CREATE UNIQUE INDEX "notifications_externalId_key" ON "notifications"("externalId");
CREATE UNIQUE INDEX "notifications_idempotencyKey_key"
  ON "notifications"("idempotencyKey");
CREATE INDEX "notifications_userId_readAt_createdAt_idx"
  ON "notifications"("userId", "readAt", "createdAt");
CREATE INDEX "notifications_userId_type_createdAt_idx"
  ON "notifications"("userId", "type", "createdAt");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "community_news"
  ADD COLUMN "externalId" UUID,
  ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'COORDINATOR_MEMBERS',
  ADD COLUMN "coordinatorId" UUID,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archiveReason" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "community_news"
SET "externalId" = "id"
WHERE "externalId" IS NULL;

ALTER TABLE "community_news"
  ALTER COLUMN "externalId" SET NOT NULL,
  ALTER COLUMN "externalId" SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX "community_news_externalId_key" ON "community_news"("externalId");
CREATE INDEX "community_news_status_audience_publishedAt_idx"
  ON "community_news"("status", "audience", "publishedAt");
CREATE INDEX "community_news_coordinatorId_status_publishedAt_idx"
  ON "community_news"("coordinatorId", "status", "publishedAt");

CREATE TABLE "news_comments" (
  "id" UUID NOT NULL,
  "externalId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "newsId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "status" "CommentStatus" NOT NULL DEFAULT 'PUBLISHED',
  "moderatedAt" TIMESTAMP(3),
  "moderatedById" UUID,
  "moderationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "news_comments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "news_comments_externalId_key" ON "news_comments"("externalId");
CREATE INDEX "news_comments_newsId_status_createdAt_idx"
  ON "news_comments"("newsId", "status", "createdAt");
CREATE INDEX "news_comments_userId_createdAt_idx"
  ON "news_comments"("userId", "createdAt");

ALTER TABLE "news_comments"
  ADD CONSTRAINT "news_comments_newsId_fkey"
  FOREIGN KEY ("newsId") REFERENCES "community_news"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "news_comments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
