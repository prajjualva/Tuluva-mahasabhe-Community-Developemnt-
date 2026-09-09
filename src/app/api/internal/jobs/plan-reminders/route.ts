import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "../../../../../server/database/prisma";
import {
  duesNeedingReminder,
  planDuesNeedingExpiry,
} from "../../../../../server/notifications/reminder-scheduler";

export async function POST(request: NextRequest) {
  const secret = process.env.INTERNAL_JOB_SECRET;
  const supplied = request.headers.get("x-internal-job-secret");
  if (
    !secret ||
    !supplied ||
    secret.length !== supplied.length ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const candidates = await prisma.due.findMany({
    where: { purpose: "PLAN_REGISTRATION", status: { in: ["PENDING", "OVERDUE"] } },
    select: {
      id: true,
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
  await prisma.$transaction([
    ...expired.flatMap((due) => [
      prisma.due.update({ where: { id: due.id }, data: { status: "EXPIRED" } }),
      prisma.auditLog.create({
        data: {
          action: "PLAN_REGISTRATION_EXPIRED",
          actorRole: "SYSTEM",
          entityType: "Due",
          entityId: due.id,
          beforeState: { status: due.status },
          afterState: { status: "EXPIRED" },
        },
      }),
    ]),
    ...reminders.flatMap((due) => [
      prisma.notification.create({
        data: {
          userId: due.member.userId,
          channel: "IN_APP",
          template: "PLAN_PAYMENT_REMINDER",
          payload: { dueId: due.id },
        },
      }),
      prisma.due.update({ where: { id: due.id }, data: { lastReminderAt: new Date() } }),
    ]),
  ]);
  return NextResponse.json({ queued: reminders.length, expired: expired.length });
}
