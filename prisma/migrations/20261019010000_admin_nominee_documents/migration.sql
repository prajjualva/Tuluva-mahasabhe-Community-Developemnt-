ALTER TABLE "audit_logs" ADD COLUMN "externalId" UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX "audit_logs_externalId_key" ON "audit_logs"("externalId");
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");
ALTER TABLE "nominee_documents" ADD COLUMN "externalId" UUID NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN "originalFilename" TEXT NOT NULL DEFAULT 'nominee-evidence',
 ADD COLUMN "sizeBytes" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "evidenceBytes" BYTEA,
 ADD COLUMN "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "nominee_documents_externalId_key" ON "nominee_documents"("externalId");
