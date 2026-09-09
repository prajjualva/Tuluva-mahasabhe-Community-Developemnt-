-- Contribution obligations are determined by whether the member existed when
-- the event was created, rather than by their current membership status.
-- For existing events, publishedAt is the most faithful historical fallback.
ALTER TABLE "contribution_events" ADD COLUMN "createdAt" TIMESTAMP(3);

UPDATE "contribution_events"
SET "createdAt" = COALESCE("publishedAt", CURRENT_TIMESTAMP)
WHERE "createdAt" IS NULL;

ALTER TABLE "contribution_events"
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "contribution_events_status_publishedAt_idx"
  ON "contribution_events"("status", "publishedAt");
