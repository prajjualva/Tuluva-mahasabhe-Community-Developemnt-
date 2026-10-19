CREATE TABLE "wallet_credit_commands" (
 "externalId" UUID PRIMARY KEY,
 "idempotencyKey" TEXT NOT NULL,
 "memberId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "amountPaise" INTEGER NOT NULL CHECK ("amountPaise" > 0),
 "purpose" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 "walletTransactionId" UUID NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "wallet_credit_commands_idempotencyKey_key" ON "wallet_credit_commands"("idempotencyKey");
CREATE UNIQUE INDEX "wallet_credit_commands_walletTransactionId_key" ON "wallet_credit_commands"("walletTransactionId");
