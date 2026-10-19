CREATE TABLE "due_waiver_requests" (
  "externalId" UUID NOT NULL,
  "dueId" UUID NOT NULL,
  "requestedById" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "decidedById" UUID,
  "decisionReason" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "due_waiver_requests_pkey" PRIMARY KEY ("externalId"),
  CONSTRAINT "due_waiver_requests_dueId_fkey" FOREIGN KEY ("dueId") REFERENCES "dues"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "due_waiver_requester_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "due_waiver_decider_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "due_waiver_state" CHECK (
    ("status" = 'PENDING' AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "decisionReason" IS NULL)
    OR ("status" IN ('APPROVED','REJECTED') AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL AND length(trim("decisionReason")) >= 3)
  )
);
CREATE UNIQUE INDEX "due_waiver_requests_idempotencyKey_key" ON "due_waiver_requests"("idempotencyKey");
CREATE INDEX "due_waiver_requests_status_createdAt_idx" ON "due_waiver_requests"("status", "createdAt");
CREATE UNIQUE INDEX "due_waiver_one_pending" ON "due_waiver_requests"("dueId") WHERE "status" = 'PENDING';
