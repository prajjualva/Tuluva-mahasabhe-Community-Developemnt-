import { Prisma, MembershipStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/prisma";
import { addUtcCalendarMonths, membershipBillingCycle } from "../../domain/calendar";
import { effectiveSchemeNumber } from "../database/scheme-policy";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";
import { suspendCoordinatorInTransaction } from "../coordinators/coordinator-management-service";

export const membershipCycleKey = (memberId: string, anchor: Date, cycle: number) =>
  `membership:${memberId}:${anchor.getTime()}:${cycle}`;

export async function ensureMembershipBillsInTransaction(
  tx: Prisma.TransactionClient,
  memberId: string,
  now = new Date(),
) {
  const member = await tx.member.findUniqueOrThrow({
    where: { id: memberId },
    include: { coordinatorProfile: { select: { id: true } } },
  });
  if (member.coordinatorProfile || ["CLOSED", "DECEASED"].includes(member.status))
    return { created: 0, currentDueId: null };
  const anchor = member.membershipBillingAnchor ?? member.joinedAt;
  if (anchor > now) return { created: 0, currentDueId: null };
  const cycle = membershipBillingCycle(anchor, now);
  const amountPaise = await effectiveSchemeNumber(tx, "annualMembershipFeePaise", now);
  const graceMonths = await effectiveSchemeNumber(tx, "membershipGraceMonths", now);
  let created = 0;
  let currentDueId: string | null = null;
  for (let index = 0; index <= cycle; index += 1) {
    const startsAt = addUtcCalendarMonths(anchor, index * 12);
    const nextStartsAt = addUtcCalendarMonths(anchor, (index + 1) * 12);
    const billingCycleKey = membershipCycleKey(member.id, anchor, index);
    const existing = await tx.due.findFirst({
      where: {
        memberId,
        purpose: "MEMBERSHIP",
        OR: [
          { billingCycleKey },
          { billingCycleKey: null, createdAt: { gte: startsAt, lt: nextStartsAt } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (existing) {
      if (index === cycle) currentDueId = existing.id;
      continue;
    }
    const due = await tx.due.create({
      data: {
        memberId,
        purpose: "MEMBERSHIP",
        amountPaise,
        billingCycleKey,
        dueAt: addUtcCalendarMonths(startsAt, graceMonths),
      },
    });
    if (index === cycle) currentDueId = due.id;
    created += 1;
    await tx.auditLog.create({
      data: {
        action: "ANNUAL_MEMBERSHIP_DUE_CREATED",
        entityType: "Due",
        entityId: due.id,
        afterState: {
          dueExternalId: due.externalId,
          amountPaise,
          billingCycleKey,
          cycleStartedAt: startsAt.toISOString(),
        },
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: member.userId,
      type: "MEMBERSHIP_GRACE_PERIOD",
      title: "Annual membership renewal due",
      body: `Your annual ₹369 membership renewal is due. The grace deadline is ${due.dueAt.toISOString().slice(0, 10)}.`,
      relatedExternalId: due.externalId,
      idempotencyKey: `membership-renewal:${billingCycleKey}`,
    });
  }
  return { created, currentDueId };
}

/** Status history uses the actual threshold date even when a scheduled worker runs late. */
export async function refreshMembershipFinancialStatus(
  tx: Prisma.TransactionClient,
  memberId: string,
  now = new Date(),
): Promise<{ expiredDues: number; status: MembershipStatus }> {
  const member = await tx.member.findUniqueOrThrow({
    where: { id: memberId },
    include: { coordinatorProfile: { select: { externalId: true, isSuspended: true } } },
  });
  if (["CLOSED", "DECEASED"].includes(member.status))
    return { expiredDues: 0, status: member.status };
  const newlyExpired = await tx.due.findMany({
    where: {
      memberId,
      purpose: { in: ["MEMBERSHIP", "CONTRIBUTION"] },
      status: { in: ["PENDING", "OVERDUE"] },
      dueAt: { lte: now },
    },
    select: { id: true, externalId: true },
  });
  await tx.due.updateMany({
    where: {
      id: { in: newlyExpired.map((due) => due.id) },
      status: { in: ["PENDING", "OVERDUE"] },
    },
    data: { status: "EXPIRED" },
  });
  for (const due of newlyExpired)
    await createInAppNotificationInTransaction(tx, {
      userId: member.userId,
      type: "DUE_EXPIRED",
      title: "A Foundation due has expired",
      body: "An unpaid Foundation due passed its deadline. Review your dues in the member portal.",
      relatedExternalId: due.externalId,
      idempotencyKey: `due-expired:${due.id}`,
    });
  const [expiredContributions, expiredMembership, graceDue, currentHistory] = await Promise.all([
    tx.due.findMany({
      where: { memberId, purpose: "CONTRIBUTION", status: "EXPIRED" },
      orderBy: { dueAt: "asc" },
      select: { dueAt: true },
    }),
    tx.due.findFirst({
      where: { memberId, purpose: "MEMBERSHIP", status: "EXPIRED" },
      orderBy: { dueAt: "asc" },
      select: { dueAt: true },
    }),
    tx.due.findFirst({
      where: { memberId, purpose: "MEMBERSHIP", status: { in: ["PENDING", "OVERDUE"] } },
      select: { createdAt: true },
    }),
    tx.membership.findFirst({ where: { memberId, endedAt: null }, orderBy: { startedAt: "desc" } }),
  ]);
  const threshold = await effectiveSchemeNumber(tx, "inactiveExpiredDuesThreshold", now);
  const thresholdDates = [
    member.coordinatorProfile ? undefined : expiredMembership?.dueAt,
    expiredContributions.length >= threshold
      ? expiredContributions[threshold - 1].dueAt
      : undefined,
  ]
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime());
  let target = member.status;
  let effectiveAt = now;
  if (member.status === "INACTIVE") {
    const inactiveHistory =
      currentHistory?.status === "INACTIVE"
        ? currentHistory
        : await tx.membership.findFirst({
            where: { memberId, status: "INACTIVE" },
            orderBy: { startedAt: "desc" },
          });
    if (inactiveHistory) {
      const closesAt = addUtcCalendarMonths(
        inactiveHistory.startedAt,
        await effectiveSchemeNumber(tx, "closedInactiveMonths", now),
      );
      if (closesAt <= now) {
        target = "CLOSED";
        effectiveAt = closesAt;
      }
    }
  } else if (thresholdDates.length) {
    target = "INACTIVE";
    effectiveAt = thresholdDates[0];
  } else {
    const reopening = await tx.communitySupportPlan.count({
      where: {
        memberId,
        isReopening: true,
        status: {
          in: ["PAYMENT_PENDING", "PENDING_COORDINATOR_APPROVAL", "PENDING_ADMIN_APPROVAL"],
        },
      },
    });
    target = (!member.coordinatorProfile && graceDue) || reopening ? "GRACE" : "ACTIVE";
  }
  if (target === member.status) return { expiredDues: newlyExpired.length, status: target };
  if (currentHistory && effectiveAt < currentHistory.startedAt)
    effectiveAt = currentHistory.startedAt;
  await tx.membership.updateMany({
    where: { memberId, endedAt: null },
    data: { endedAt: effectiveAt },
  });
  await tx.membership.create({ data: { memberId, status: target, startedAt: effectiveAt } });
  await tx.member.update({
    where: { id: memberId },
    data: { status: target, ...(target === "CLOSED" ? { closedAt: effectiveAt } : {}) },
  });
  if (target === "INACTIVE")
    await tx.communitySupportPlan.updateMany({
      where: { memberId, status: "ACTIVE" },
      data: { status: "SUSPENDED" },
    });
  if (target === "CLOSED") {
    await tx.authSession.updateMany({
      where: { userId: member.userId, invalidatedAt: null },
      data: { invalidatedAt: now },
    });
    await tx.paymentMandate.updateMany({ where: { memberId }, data: { status: "CANCELLED" } });
    if (member.coordinatorProfile && !member.coordinatorProfile.isSuspended)
      await suspendCoordinatorInTransaction(tx, {
        actorId: null,
        coordinatorExternalId: member.coordinatorProfile.externalId,
        reason: "Coordinator membership closed after one full year inactive",
        mode: "FOUNDATION_ADMIN",
      });
  }
  await tx.auditLog.create({
    data: {
      action: `MEMBERSHIP_STATUS_${target}`,
      entityType: "Member",
      entityId: member.id,
      beforeState: { status: member.status },
      afterState: {
        status: target,
        effectiveAt: effectiveAt.toISOString(),
        expiredContributionCount: expiredContributions.length,
      },
    },
  });
  await createInAppNotificationInTransaction(tx, {
    userId: member.userId,
    type: target === "GRACE" ? "MEMBERSHIP_GRACE_PERIOD" : "SYSTEM",
    title: `Membership ${target.toLowerCase()}`,
    body:
      target === "CLOSED"
        ? "Your membership closed after one full year inactive. Contact Foundation Admin to request reopening."
        : target === "INACTIVE"
          ? "Clear all outstanding dues and the current annual membership fee to request reactivation."
          : "Your membership payment status has been updated.",
    relatedExternalId: member.externalId,
    idempotencyKey: `membership-status:${member.id}:${target}:${effectiveAt.toISOString()}`,
  });
  // A late worker can discover both inactivity and its completed closure period.
  if (target === "INACTIVE") {
    const next = await refreshMembershipFinancialStatus(tx, memberId, now);
    return { ...next, expiredDues: newlyExpired.length + next.expiredDues };
  }
  return { expiredDues: newlyExpired.length, status: target };
}

export async function processMemberBilling(memberId: string, now = new Date()) {
  return runSerializablePaymentTransaction(async (tx) => {
    const billing = await ensureMembershipBillsInTransaction(tx, memberId, now);
    return { ...billing, ...(await refreshMembershipFinancialStatus(tx, memberId, now)) };
  });
}
export async function processMembershipLifecycle(now = new Date()) {
  const members = await prisma.member.findMany({
    where: { status: { notIn: ["CLOSED", "DECEASED"] } },
    select: { id: true },
  });
  let generatedDues = 0;
  let closedMembers = 0;
  for (const member of members) {
    const result = await processMemberBilling(member.id, now);
    generatedDues += result.created;
    if (result.status === "CLOSED") closedMembers += 1;
  }
  return { processedMembers: members.length, generatedDues, closedMembers };
}

export async function reopenClosedMembership(actorId: string, externalId: string, input: unknown) {
  z.string().uuid().parse(externalId);
  const command = z
    .object({ reason: z.string().trim().min(3).max(1000) })
    .strict()
    .parse(input);
  return runSerializablePaymentTransaction(async (tx) => {
    const member = await tx.member.findUnique({
      where: { externalId },
      include: { coordinatorProfile: { select: { id: true } } },
    });
    if (!member || member.status !== "CLOSED")
      throw new Error("Only a closed membership can be reopened by Admin");
    const now = new Date();
    const cancelled = await tx.due.updateMany({
      where: { memberId: member.id, status: { in: ["PENDING", "OVERDUE", "EXPIRED"] } },
      data: { status: "CANCELLED" },
    });
    await tx.communitySupportPlan.updateMany({
      where: { memberId: member.id, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED", endedAt: now },
    });
    await tx.membership.updateMany({
      where: { memberId: member.id, endedAt: null },
      data: { endedAt: now },
    });
    const exempt = Boolean(member.coordinatorProfile);
    await tx.member.update({
      where: { id: member.id },
      data: { status: exempt ? "ACTIVE" : "GRACE", closedAt: null, membershipBillingAnchor: now },
    });
    await tx.membership.create({
      data: { memberId: member.id, status: exempt ? "ACTIVE" : "GRACE", startedAt: now },
    });
    const plan = await tx.communitySupportPlan.create({
      data: {
        memberId: member.id,
        isReopening: true,
        status: exempt ? "ACTIVE" : "PAYMENT_PENDING",
        ...(exempt
          ? {
              activatedAt: now,
              waitingEndsAt: addUtcCalendarMonths(
                now,
                await effectiveSchemeNumber(tx, "initialWaitingMonths", now),
              ),
            }
          : {}),
      },
    });
    if (!exempt) {
      await tx.due.create({
        data: {
          memberId: member.id,
          purpose: "MEMBERSHIP",
          billingCycleKey: membershipCycleKey(member.id, now, 0),
          amountPaise: await effectiveSchemeNumber(tx, "annualMembershipFeePaise", now),
          dueAt: addUtcCalendarMonths(
            now,
            await effectiveSchemeNumber(tx, "membershipGraceMonths", now),
          ),
        },
      });
      await tx.due.create({
        data: {
          memberId: member.id,
          planId: plan.id,
          purpose: "PLAN_REGISTRATION",
          amountPaise: await effectiveSchemeNumber(tx, "planRegistrationFeePaise", now),
          dueAt: new Date(
            now.getTime() + (await effectiveSchemeNumber(tx, "planPaymentDueDays", now)) * 86400000,
          ),
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId,
        action: "ADMIN_CLOSED_MEMBERSHIP_REOPENED",
        entityType: "Member",
        entityId: member.id,
        reason: command.reason,
        beforeState: { status: "CLOSED" },
        afterState: {
          status: exempt ? "ACTIVE" : "GRACE",
          cancelledOldDues: cancelled.count,
          planExternalId: plan.externalId,
          coordinatorFeeExemption: exempt,
          walletPreserved: true,
        },
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: member.userId,
      type: "SYSTEM",
      title: "Admin reopened your membership",
      body: exempt
        ? "Your membership was reopened under the Coordinator fee exemption. A new six-month waiting period applies to the new plan."
        : "Your member ID and wallet were preserved. Pay the new ₹369 and ₹1,000 registration dues and complete plan approval. A new six-month waiting period will apply.",
      relatedExternalId: member.externalId,
      idempotencyKey: `membership-reopened:${plan.externalId}`,
    });
    return {
      memberExternalId: member.externalId,
      planExternalId: plan.externalId,
      status: exempt ? "ACTIVE" : "GRACE",
    };
  });
}
