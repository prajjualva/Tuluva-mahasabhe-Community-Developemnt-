import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";

/**
 * Notification types are intentionally stable strings. They are used by the
 * in-app inbox now and form the provider-neutral contract for future email and
 * SMS adapters. No external channel is treated as delivered without an
 * explicitly configured adapter.
 */
export const NOTIFICATION_TYPES = [
  "REGISTRATION",
  "EMAIL_VERIFICATION",
  "MOBILE_VERIFICATION",
  "COORDINATOR_ASSIGNED",
  "COORDINATOR_CHANGED",
  "DUE_REMINDER",
  "DUE_EXPIRED",
  "MEMBERSHIP_GRACE_PERIOD",
  "PLAN_REGISTRATION",
  "PLAN_EXPIRY",
  "PAYMENT_SUCCEEDED",
  "PAYMENT_FAILED",
  "RECEIPT_GENERATED",
  "WALLET_CREDIT",
  "WALLET_PAYMENT",
  "DEATH_REPORT",
  "DEATH_SUPPORT_EVENT_APPROVED",
  "DEATH_SUPPORT_EVENT_REJECTED",
  "EVENT_CONTRIBUTION_DUE",
  "SUPPORT_PAYMENT",
  "NOMINEE_VERIFICATION",
  "CASH_COLLECTION",
  "CASH_DISCREPANCY",
  "COORDINATOR_SUSPENDED",
  "COORDINATOR_RESTORED",
  "FOUNDATION_ADMIN_TEMPORARY_MANAGEMENT",
  "COORDINATOR_RETURN",
  "COMMUNITY_NEWS",
  "SYSTEM",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS";

const sensitivePayloadKey = /password|otp|secret|token|bank|account|ifsc|credential/i;
const safeNotificationSelect = {
  externalId: true,
  type: true,
  channel: true,
  title: true,
  body: true,
  template: true,
  relatedExternalId: true,
  createdAt: true,
  sentAt: true,
  readAt: true,
} satisfies Prisma.NotificationSelect;

export type SafeNotification = Prisma.NotificationGetPayload<{
  select: typeof safeNotificationSelect;
}>;

export type InAppNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  template?: string;
  relatedExternalId?: string;
  payload?: Record<string, unknown>;
  /** Replays return the same inbox entry instead of creating another one. */
  idempotencyKey?: string;
  requestId?: string;
};

export type NotificationChannelAdapter = {
  channel: NotificationChannel;
  deliver(notification: SafeNotification): Promise<{ delivered: boolean; reason?: string }>;
};

const inAppNotificationAdapter: NotificationChannelAdapter = {
  channel: "IN_APP",
  async deliver() {
    // The durable inbox row is the in-app delivery record. It is created in
    // the originating business transaction, so this adapter cannot fabricate
    // delivery to another system.
    return { delivered: true };
  },
};

/**
 * Only IN_APP has a configured adapter. Email/SMS remain explicit extension
 * points and report unavailable until credentials and a real provider adapter
 * are installed.
 */
export const notificationChannelAdapters: ReadonlyMap<
  NotificationChannel,
  NotificationChannelAdapter
> = new Map([["IN_APP", inAppNotificationAdapter]]);

export async function deliverNotificationThroughChannel(
  channel: NotificationChannel,
  notification: SafeNotification,
) {
  const adapter = notificationChannelAdapters.get(channel);
  if (!adapter) return { delivered: false, reason: "CHANNEL_NOT_CONFIGURED" as const };
  return adapter.deliver(notification);
}

function sanitizePayload(value: unknown, depth = 0): Prisma.InputJsonValue {
  if (value === null) return "";
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) {
    if (depth >= 3) return [];
    return value.slice(0, 25).map((item) => sanitizePayload(item, depth + 1));
  }
  if (value && typeof value === "object") {
    if (depth >= 3) return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !sensitivePayloadKey.test(key))
        .slice(0, 25)
        .map(([key, item]) => [key.slice(0, 80), sanitizePayload(item, depth + 1)]),
    );
  }
  return "";
}

function validateNotificationInput(input: InAppNotificationInput) {
  if (!NOTIFICATION_TYPES.includes(input.type)) throw new Error("Notification type is invalid");
  if (!input.userId) throw new Error("Notification recipient is required");
  if (!input.title.trim() || !input.body.trim())
    throw new Error("Notification title and body are required");
  if (input.title.length > 180 || input.body.length > 4000)
    throw new Error("Notification content is too long");
  if (input.idempotencyKey && input.idempotencyKey.length > 240)
    throw new Error("Notification idempotency key is too long");
}

/** Create an in-app notification inside the caller's business transaction. */
export async function createInAppNotificationInTransaction(
  tx: Prisma.TransactionClient,
  input: InAppNotificationInput,
): Promise<SafeNotification> {
  validateNotificationInput(input);
  if (input.idempotencyKey) {
    const replay = await tx.notification.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { userId: true, ...safeNotificationSelect },
    });
    if (replay) {
      if (replay.userId !== input.userId) throw new Error("Notification idempotency key collision");
      const { userId: _userId, ...safe } = replay;
      void _userId;
      return safe;
    }
  }

  const now = new Date();
  const data = {
    userId: input.userId,
    channel: "IN_APP",
    type: input.type,
    title: input.title.trim(),
    body: input.body.trim(),
    template: input.template?.trim() || input.type,
    relatedExternalId: input.relatedExternalId,
    payload: sanitizePayload({ ...input.payload, requestId: input.requestId }),
    idempotencyKey: input.idempotencyKey,
    sentAt: now,
  };
  if (input.idempotencyKey) {
    // ON CONFLICT avoids aborting the surrounding financial transaction when
    // concurrent requests deliver the same notification.
    await tx.notification.createMany({ data: [data], skipDuplicates: true });
    const replay = await tx.notification.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { userId: true, ...safeNotificationSelect },
    });
    if (!replay || replay.userId !== input.userId)
      throw new Error("Notification idempotency key collision");
    const { userId: _userId, ...safe } = replay;
    void _userId;
    return safe;
  }
  return tx.notification.create({ data, select: safeNotificationSelect });
}

export async function createInAppNotification(input: InAppNotificationInput) {
  const notification = await prisma.$transaction((tx) =>
    createInAppNotificationInTransaction(tx, input),
  );
  await deliverNotificationThroughChannel("IN_APP", notification);
  return notification;
}

export async function notifyMemberByMemberId(
  input: Omit<InAppNotificationInput, "userId"> & { memberId: string },
) {
  return prisma.$transaction(async (tx) => {
    return notifyMemberByMemberIdInTransaction(tx, input);
  });
}

export async function notifyMemberByMemberIdInTransaction(
  tx: Prisma.TransactionClient,
  input: Omit<InAppNotificationInput, "userId"> & { memberId: string },
) {
  const member = await tx.member.findUnique({
    where: { id: input.memberId },
    select: { userId: true },
  });
  if (!member) throw new Error("Member not found");
  return createInAppNotificationInTransaction(tx, { ...input, userId: member.userId });
}

export async function listNotificationsForUser(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
) {
  return prisma.notification.findMany({
    where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
    select: safeNotificationSelect,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(options.limit ?? 50, 1), 100),
  });
}

export async function unreadNotificationCountForUser(userId: string) {
  return prisma.notification
    .count({ where: { userId, readAt: null } })
    .then((count) => ({ count }));
}

/** The user id condition prevents notification-IDOR across member accounts. */
export async function markNotificationReadForUser(userId: string, notificationExternalId: string) {
  const notification = await prisma.notification.findFirst({
    where: { userId, externalId: notificationExternalId },
    select: { id: true, ...safeNotificationSelect },
  });
  if (!notification) throw new Error("Notification not found");
  if (notification.readAt) {
    const { id: _id, ...safe } = notification;
    void _id;
    return safe;
  }
  return prisma.notification.update({
    where: { id: notification.id },
    data: { readAt: new Date() },
    select: safeNotificationSelect,
  });
}

export async function markAllNotificationsReadForUser(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { markedRead: result.count };
}
