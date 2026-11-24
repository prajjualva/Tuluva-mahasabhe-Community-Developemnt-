import { createHmac, randomUUID } from "node:crypto";
import { after } from "next/server";
import { prisma } from "../database/prisma";
import {
  notificationTransport,
  type ExternalNotificationChannel,
} from "./notification-delivery-provider";

const hour = 3600_000;
const maxAgeMs = 7 * 24 * hour;
const maxRetryMs = 23 * hour; // Resend retains idempotency keys for 24 hours.
const leaseMs = 120_000;
const channels: ExternalNotificationChannel[] = ["EMAIL", "SMS"];

type DeliveryScope = { relatedExternalId?: string; userId?: string; limit?: number };

export function scheduleNotificationDelivery(scope: DeliveryScope) {
  try {
    after(async () => {
      try {
        await deliverQueuedNotifications(scope);
      } catch {
        console.error("Transactional notification delivery could not complete.");
      }
    });
  } catch {
    // The scheduled worker can still process the committed queue without a request context.
  }
}

export async function deliverQueuedNotifications(options: DeliveryScope = {}) {
  const counts = { accepted: 0, deferred: 0, failed: 0, skipped: 0 };
  const key = process.env.AUTH_SECRET;
  if (!key || key.length < 32) return counts;
  const configured = channels.flatMap((channel) => {
    const transport = notificationTransport(channel);
    return transport ? [{ channel, transport }] : [];
  });
  if (!configured.length) return counts;
  // Queue availability is assigned by PostgreSQL's trigger. Use that same clock:
  // even a small application/server skew can otherwise miss a newly committed email.
  const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  if (!clock?.now || !Number.isFinite(clock.now.getTime()))
    throw new Error("Queue clock unavailable");
  const startedAt = performance.now();
  const queueNow = () => new Date(clock.now.getTime() + performance.now() - startedAt);
  const limit = Math.max(1, Math.min(options.limit ?? 100, 100));
  const stopAt = startedAt + 225_000;
  for (const { channel, transport } of configured) {
    const deliveries = await prisma.notificationDelivery.findMany({
      where: {
        channel,
        state: { in: ["PENDING", "SENDING"] },
        OR: [
          { availableAt: { lte: queueNow() } },
          ...(options.userId ? [{ state: "PENDING", firstAttemptAt: null }] : []),
        ],
        notification: { relatedExternalId: options.relatedExternalId, userId: options.userId },
      },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
      take: limit,
      include: {
        notification: {
          select: {
            type: true,
            template: true,
            createdAt: true,
            user: {
              select: {
                status: true,
                email: true,
                mobile: true,
                emailVerifiedAt: true,
                mobileVerifiedAt: true,
              },
            },
          },
        },
      },
    });
    for (const delivery of deliveries) {
      const now = queueNow();
      if (performance.now() >= stopAt) return counts;
      const { user, type, template, createdAt } = delivery.notification;
      const destination = channel === "EMAIL" ? user.email : user.mobile;
      const verified = channel === "EMAIL" ? user.emailVerifiedAt : user.mobileVerifiedAt;
      // A rate-limited registration can send one generic welcome email. Subsequent
      // account messages are only forwarded to a contact the recipient has verified.
      const welcome = channel === "EMAIL" && type === "REGISTRATION";
      const eligible = user.status === "ACTIVE" && destination && (verified || welcome);
      const age = now.getTime() - createdAt.getTime();
      const recipientHash = destination
        ? createHmac("sha256", key).update(destination).digest("hex")
        : null;
      const claim = {
        id: delivery.id,
        state: delivery.state,
        availableAt: delivery.availableAt,
        claimToken: delivery.claimToken,
      };
      if (
        user.status !== "ACTIVE" ||
        age >= maxAgeMs ||
        (delivery.recipientHash && delivery.recipientHash !== recipientHash)
      ) {
        const skipped = await prisma.notificationDelivery.updateMany({
          where: claim,
          data: { state: "SKIPPED", claimToken: null },
        });
        counts.skipped += skipped.count;
        continue;
      }
      if (
        delivery.firstAttemptAt &&
        now.getTime() - delivery.firstAttemptAt.getTime() >= maxRetryMs
      ) {
        const failed = await prisma.notificationDelivery.updateMany({
          where: claim,
          data: { state: "FAILED", claimToken: null },
        });
        counts.failed += failed.count;
        continue;
      }
      if (!eligible) {
        const deferred = await prisma.notificationDelivery.updateMany({
          where: claim,
          data: { state: "PENDING", claimToken: null, availableAt: new Date(now.getTime() + hour) },
        });
        counts.deferred += deferred.count;
        continue;
      }
      const claimToken = randomUUID();
      const claimed = await prisma.notificationDelivery.updateMany({
        where: claim,
        data: {
          state: "SENDING",
          availableAt: new Date(now.getTime() + leaseMs),
          claimToken,
          firstAttemptAt: delivery.firstAttemptAt ?? now,
          attempts: { increment: 1 },
          recipientHash,
        },
      });
      if (claimed.count !== 1) continue;
      const result = await transport({
        destination,
        type,
        template,
        idempotencyKey: `tuluworld-notification/${delivery.id}`,
      });
      const completed = await prisma.notificationDelivery.updateMany({
        where: { id: delivery.id, state: "SENDING", claimToken },
        data: {
          state: result === "RETRY" ? "PENDING" : result,
          claimToken: null,
          ...(result === "ACCEPTED" && { acceptedAt: queueNow() }),
          ...(result === "RETRY" && {
            availableAt: new Date(
              queueNow().getTime() + Math.min(2 ** Math.min(delivery.attempts, 6), 60) * 60_000,
            ),
          }),
        },
      });
      if (result === "ACCEPTED") counts.accepted += completed.count;
      else if (result === "FAILED") counts.failed += completed.count;
      else counts.deferred += completed.count;
    }
  }
  return counts;
}
