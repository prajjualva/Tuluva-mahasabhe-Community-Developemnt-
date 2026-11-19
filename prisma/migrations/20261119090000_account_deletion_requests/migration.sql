CREATE TYPE "AccountDeletionRequestStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'CANCELLED');

CREATE TABLE "account_deletion_requests" (
    "externalId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "AccountDeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "memberMessage" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("externalId"),
    CONSTRAINT "account_deletion_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "account_deletion_requests_userId_key" ON "account_deletion_requests"("userId");
CREATE INDEX "account_deletion_requests_status_requestedAt_idx" ON "account_deletion_requests"("status", "requestedAt");
