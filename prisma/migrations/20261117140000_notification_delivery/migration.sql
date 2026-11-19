CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notificationId" UUID NOT NULL,
    "channel" TEXT NOT NULL CHECK ("channel" IN ('EMAIL', 'SMS')),
    "state" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("state" IN ('PENDING', 'SENDING', 'ACCEPTED', 'FAILED', 'SKIPPED')),
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstAttemptAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimToken" UUID,
    "recipientHash" TEXT,
    "acceptedAt" TIMESTAMP(3),
    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_deliveries_notificationId_fkey"
        FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_deliveries_notificationId_channel_key"
    ON "notification_deliveries" ("notificationId", "channel");
CREATE INDEX "notification_deliveries_channel_state_availableAt_idx"
    ON "notification_deliveries" ("channel", "state", "availableAt");

-- Enqueue at the same commit as the in-app notification, including bulk fan-out.
CREATE FUNCTION queue_notification_delivery() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO "notification_deliveries" ("notificationId", "channel")
    VALUES (NEW.id, 'EMAIL'), (NEW.id, 'SMS');
    RETURN NEW;
END;
$$;

CREATE TRIGGER "queue_notification_delivery"
AFTER INSERT ON "notifications"
FOR EACH ROW
WHEN (NEW.channel = 'IN_APP' AND NEW.type NOT IN ('EMAIL_VERIFICATION', 'MOBILE_VERIFICATION'))
EXECUTE FUNCTION queue_notification_delivery();
