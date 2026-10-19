import { prisma } from "../database/prisma";
import { duesNeedingReminder } from "./reminder-scheduler";
import { createInAppNotificationInTransaction } from "./notification-service";

/**
 * Durable five-day reminder cadence for membership and ₹100 contribution dues.
 * Plan-registration dues use the dedicated plan job because their expiry has
 * additional approval-extension behavior.
 */
export async function queueOutstandingDueReminders(now = new Date()) {
  const candidates = await prisma.due.findMany({
    where: {
      purpose: { not: "PLAN_REGISTRATION" },
      status: { in: ["PENDING", "OVERDUE"] },
      dueAt: { gt: now },
      member: { status: { notIn: ["DECEASED", "CLOSED"] } },
      OR: [
        { lastReminderAt: null },
        { lastReminderAt: { lte: new Date(now.getTime() - 5 * 86400000) } },
      ],
    },
    take: 500,
    orderBy: [{ lastReminderAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      externalId: true,
      purpose: true,
      status: true,
      dueAt: true,
      lastReminderAt: true,
      member: { select: { userId: true } },
    },
  });
  const reminders = duesNeedingReminder(candidates, now);
  let queued = 0;
  for (const due of reminders) {
    const claimed = await prisma.$transaction(
      async (tx) => {
        const marked = await tx.due.updateMany({
          where: {
            id: due.id,
            status: { in: ["PENDING", "OVERDUE"] },
            dueAt: { gt: now },
            member: { status: { notIn: ["DECEASED", "CLOSED"] } },
            OR: [
              { lastReminderAt: null },
              { lastReminderAt: { lte: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) } },
            ],
          },
          data: { lastReminderAt: now },
        });
        if (!marked.count) return false;
        const isMembership = due.purpose === "MEMBERSHIP";
        const reminderCycle = Math.floor(now.getTime() / (5 * 24 * 60 * 60 * 1000));
        await createInAppNotificationInTransaction(tx, {
          userId: due.member.userId,
          type: isMembership ? "MEMBERSHIP_GRACE_PERIOD" : "DUE_REMINDER",
          title: isMembership
            ? "Membership grace-period reminder"
            : "Foundation contribution reminder",
          body: isMembership
            ? "Your ₹369 membership payment remains due during the grace period. Please pay before the deadline shown in your member portal."
            : "A ₹100 Death Support contribution remains due. Please pay before the deadline shown in your member portal.",
          template: isMembership ? "MEMBERSHIP_GRACE_REMINDER" : "CONTRIBUTION_DUE_REMINDER",
          relatedExternalId: due.externalId,
          payload: { dueExternalId: due.externalId, purpose: due.purpose },
          idempotencyKey: `due-reminder:${due.id}:${reminderCycle}`,
        });
        await tx.auditLog.create({
          data: {
            actorRole: "SYSTEM",
            action: "DUE_REMINDER_QUEUED",
            entityType: "Due",
            entityId: due.id,
            afterState: { purpose: due.purpose, reminderCycle },
          },
        });
        return true;
      },
      { timeout: 15000 },
    );
    if (claimed) queued += 1;
  }
  return { queued };
}
