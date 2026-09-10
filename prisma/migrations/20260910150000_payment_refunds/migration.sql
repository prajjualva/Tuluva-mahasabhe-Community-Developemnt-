-- Refunds are append-only compensating records. The original payment and
-- official receipt remain intact for financial traceability.
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE "payment_refunds" (
  "id" UUID NOT NULL,
  "externalId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "providerReference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "authorizedActorId" UUID,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_refunds_externalId_key" ON "payment_refunds"("externalId");
CREATE UNIQUE INDEX "payment_refunds_paymentId_key" ON "payment_refunds"("paymentId");
CREATE UNIQUE INDEX "payment_refunds_providerReference_key" ON "payment_refunds"("providerReference");
CREATE UNIQUE INDEX "payment_refunds_idempotencyKey_key" ON "payment_refunds"("idempotencyKey");
CREATE INDEX "payment_refunds_status_createdAt_idx" ON "payment_refunds"("status", "createdAt");

ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
