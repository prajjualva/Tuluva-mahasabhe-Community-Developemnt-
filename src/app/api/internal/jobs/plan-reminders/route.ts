import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalJob } from "../../../../../server/security/internal-job-auth";
import { prisma } from "../../../../../server/database/prisma";
import {
  duesNeedingReminder,
  planDuesNeedingExpiry,
} from "../../../../../server/notifications/reminder-scheduler";
import { createInAppNotificationInTransaction } from "../../../../../server/notifications/notification-service";

export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalJob(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const candidates = await prisma.due.findMany({
    where: {
      purpose: "PLAN_REGISTRATION",
      status: { in: ["PENDING", "OVERDUE"] },
      member: { status: { notIn: ["CLOSED", "DECEASED"] } },
      OR: [
        { dueAt: { lte: new Date() } },
        { lastReminderAt: null },
        { lastReminderAt: { lte: new Date(Date.now() - 5 * 86400000) } },
      ],
    },
    take: 500,
    orderBy: { id: "asc" },
    select: {
      id: true,
      externalId: true,
      memberId: true,
      status: true,
      dueAt: true,
      lastReminderAt: true,
      member: { select: { userId: true } },
    },
  });
  const now = new Date();
  const expired = planDuesNeedingExpiry(candidates, now);
  const reminders = duesNeedingReminder(candidates, now).filter(
    (due) => !expired.some((item) => item.id === due.id),
  );
  let queued = 0;
  let expiredCount = 0;
  for (const due of expired) {
    const claimed = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.due.updateMany({
          where: { id: due.id, status: { in: ["PENDING", "OVERDUE"] } },
          data: { status: "EXPIRED" },
        });
        if (!updated.count) return false;
        await tx.auditLog.create({
          data: {
            action: "PLAN_REGISTRATION_EXPIRED",
            actorRole: "SYSTEM",
            entityType: "Due",
            entityId: due.id,
            beforeState: { status: due.status },
            afterState: { status: "EXPIRED" },
          },
        });
        await createInAppNotificationInTransaction(tx, {
          userId: due.member.userId,
          type: "PLAN_EXPIRY",
          title: "Community Support Plan registration expired",
          body: "Your ₹1,000 Community Support Plan registration payment deadline has passed. Contact the Foundation for an approved extension.",
          template: "PLAN_REGISTRATION_EXPIRED",
          relatedExternalId: due.externalId,
          payload: { dueExternalId: due.externalId },
          idempotencyKey: `plan-expiry:${due.id}`,
        });
        return true;
      },
      { timeout: 15000 },
    );
    if (claimed) expiredCount += 1;
  }
  for (const due of reminders) {
    const claimed = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.due.updateMany({
          where: {
            id: due.id,
            status: { in: ["PENDING", "OVERDUE"] },
            dueAt: { gt: now },
            member: { status: { notIn: ["DECEASED", "CLOSED"] } },
            OR: [
              { lastReminderAt: null },
              { lastReminderAt: { lte: new Date(now.getTime() - 5 * 86400000) } },
            ],
          },
          data: { lastReminderAt: now },
        });
        if (!updated.count) return false;
        const reminderCycle = Math.floor(now.getTime() / (5 * 24 * 60 * 60 * 1000));
        await createInAppNotificationInTransaction(tx, {
          userId: due.member.userId,
          type: "DUE_REMINDER",
          title: "Community Support Plan payment reminder",
          body: "Your ₹1,000 Community Support Plan registration payment is still due. Please pay before the deadline shown in your member portal.",
          template: "PLAN_PAYMENT_REMINDER",
          relatedExternalId: due.externalId,
          payload: { dueExternalId: due.externalId },
          idempotencyKey: `plan-reminder:${due.id}:${reminderCycle}`,
        });
        return true;
      },
      { timeout: 15000 },
    );
    if (claimed) queued += 1;
  }
  return NextResponse.json({ queued, expired: expiredCount });
}

export const GET = POST;
export const maxDuration = 300;
export const dynamic = "force-dynamic";
