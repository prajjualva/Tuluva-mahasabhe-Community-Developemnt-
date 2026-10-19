import { Prisma, PlanStatus } from "@prisma/client";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";
import { addUtcCalendarMonths } from "../../domain/calendar";
import { effectiveSchemeNumber } from "../database/scheme-policy";

export function canStartPlanRegistration(
  membershipStatus: string,
  hasExistingPlan: boolean,
  hasPendingReopening: boolean,
) {
  return membershipStatus === "CLOSED" ? !hasPendingReopening : !hasExistingPlan;
}

export async function startPlanRegistration(memberId: string, actorId: string) {
  return runSerializablePaymentTransaction(async (tx) => {
    const member = await tx.member.findUnique({
      where: { id: memberId },
      select: {
        status: true,
        userId: true,
        externalId: true,
        coordinatorProfile: { select: { id: true } },
      },
    });
    if (!member) throw new Error("Member not found");
    if (member.status === "CLOSED" || member.status === "DECEASED")
      throw new Error("Only Foundation Admin can reopen a closed membership");
    if (member.coordinatorProfile)
      throw new Error("Coordinators are exempt from the ₹1,000 registration fee");
    const existing = await tx.communitySupportPlan.findFirst({ where: { memberId } });
    const pendingReopening = await tx.communitySupportPlan.findFirst({
      where: {
        memberId,
        status: {
          in: ["PAYMENT_PENDING", "PENDING_COORDINATOR_APPROVAL", "PENDING_ADMIN_APPROVAL"],
        },
      },
    });
    // A normal inactive member retains every prior plan and never pays a
    // second ₹1,000. A CLOSED member may begin exactly one fresh reopening
    // registration alongside their historical plan.
    if (!canStartPlanRegistration(member.status, Boolean(existing), Boolean(pendingReopening)))
      throw new Error("A Community Support Plan already exists");
    const plan = await tx.communitySupportPlan.create({
      data: { memberId, status: "PAYMENT_PENDING" },
    });
    const due = await tx.due.create({
      data: {
        memberId,
        planId: plan.id,
        purpose: "PLAN_REGISTRATION",
        amountPaise: await effectiveSchemeNumber(tx, "planRegistrationFeePaise"),
        dueAt: new Date(
          Date.now() + (await effectiveSchemeNumber(tx, "planPaymentDueDays")) * 86400000,
        ),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "PLAN_REGISTRATION_STARTED",
        entityType: "CommunitySupportPlan",
        entityId: plan.id,
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: member.userId,
      type: "PLAN_REGISTRATION",
      title: "Community Support Plan registration started",
      body: "Your ₹1,000 plan registration is awaiting payment. Please pay before the deadline shown in your member portal.",
      template: "PLAN_REGISTRATION_STARTED",
      relatedExternalId: plan.externalId,
      payload: { planExternalId: plan.externalId, dueExternalId: due.externalId },
      idempotencyKey: `plan-registration:${plan.id}`,
    });
    return { plan, due };
  });
}

/** Called only from the payment settlement transaction after the plan due is paid. */
export async function advancePlanAfterRegistrationPayment(
  tx: Prisma.TransactionClient,
  planId: string,
) {
  const plan = await tx.communitySupportPlan.findUniqueOrThrow({
    where: { id: planId },
    include: { member: { select: { userId: true } } },
  });
  if (plan.status === "PAYMENT_PENDING") {
    const updated = await tx.communitySupportPlan.update({
      where: { id: plan.id },
      data: { status: "PENDING_COORDINATOR_APPROVAL" },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: plan.member.userId,
      type: "PLAN_REGISTRATION",
      title: "Plan payment received",
      body: "Your ₹1,000 registration payment was received and is awaiting Coordinator approval.",
      template: "PLAN_PAYMENT_RECEIVED",
      relatedExternalId: updated.externalId,
      idempotencyKey: `plan:${updated.id}:coordinator-approval`,
    });
    return updated;
  }
  return plan;
}

export async function approvePlan(
  externalPlanId: string,
  actorId: string,
  stage: "COORDINATOR" | "ADMIN",
  overrideReason?: string,
) {
  return runSerializablePaymentTransaction(async (tx) => {
    const plan = await tx.communitySupportPlan.findUnique({
      where: { externalId: externalPlanId },
      include: {
        member: {
          select: {
            coordinatorId: true,
            status: true,
            userId: true,
            membershipBillingAnchor: true,
            joinedAt: true,
          },
        },
      },
    });
    if (!plan) throw new Error("Plan not found");
    if (["CLOSED", "DECEASED"].includes(plan.member.status))
      throw new Error("Membership is not open for plan approval");
    if (stage === "COORDINATOR") {
      if (plan.status !== "PENDING_COORDINATOR_APPROVAL")
        throw new Error("Plan is not ready for Coordinator approval");
      const coordinator = await tx.coordinator.findFirst({
        where: { member: { userId: actorId }, isSuspended: false, status: "ACTIVE" },
        select: { id: true },
      });
      if (!coordinator || coordinator.id !== plan.member.coordinatorId) {
        const adminCoverage =
          !plan.member.coordinatorId &&
          overrideReason?.trim() &&
          (await tx.userRole.count({
            where: { userId: actorId, active: true, role: { code: "ADMIN" } },
          }));
        if (!adminCoverage) throw new Error("Coordinator is not assigned to this member");
      }
      await tx.communitySupportPlan.update({
        where: { id: plan.id },
        data: { status: "PENDING_ADMIN_APPROVAL" },
      });
    } else {
      if (plan.status !== "PENDING_ADMIN_APPROVAL")
        throw new Error("Plan is not ready for Admin approval");
      const now = new Date();
      if (
        plan.isReopening &&
        (await tx.due.count({
          where: {
            memberId: plan.memberId,
            purpose: "MEMBERSHIP",
            status: { in: ["PENDING", "OVERDUE", "EXPIRED"] },
          },
        }))
      )
        throw new Error("Pay the new ₹369 membership fee before reopening plan approval");
      if (
        plan.isReopening &&
        !(await tx.due.findFirst({
          where: {
            memberId: plan.memberId,
            purpose: "MEMBERSHIP",
            status: "PAID",
            createdAt: { gte: plan.member.membershipBillingAnchor ?? plan.member.joinedAt },
            payments: {
              some: {
                status: "SUCCEEDED",
                OR: [{ refund: null }, { refund: { status: { not: "SUCCEEDED" } } }],
              },
            },
          },
          select: { id: true },
        }))
      )
        throw new Error("A successful current ₹369 membership payment is required for reopening");
      await tx.communitySupportPlan.update({
        where: { id: plan.id },
        data: {
          status: plan.member.status === "INACTIVE" && !plan.isReopening ? "SUSPENDED" : "ACTIVE",
          activatedAt: now,
          waitingEndsAt: addUtcCalendarMonths(
            now,
            await effectiveSchemeNumber(tx, "initialWaitingMonths", now),
          ),
        },
      });
      // CLOSED is deliberately different from ordinary INACTIVE reactivation:
      // it becomes ACTIVE only after a brand-new ₹1,000 registration has made
      // it through both approval stages.
      if (plan.isReopening) {
        await tx.member.update({
          where: { id: plan.memberId },
          data: { status: "ACTIVE", closedAt: null },
        });
        await tx.membership.updateMany({
          where: { memberId: plan.memberId, endedAt: null },
          data: { endedAt: now },
        });
        await tx.membership.create({
          data: { memberId: plan.memberId, status: "ACTIVE", startedAt: now },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "MEMBERSHIP_REOPENED_WITH_NEW_PLAN",
            entityType: "Member",
            entityId: plan.memberId,
            afterState: { status: "ACTIVE", planId: plan.id },
          },
        });
      }
    }
    const updated = await tx.communitySupportPlan.findUniqueOrThrow({ where: { id: plan.id } });
    await tx.auditLog.create({
      data: {
        actorId,
        action: `PLAN_${stage}_APPROVED`,
        reason: overrideReason?.trim(),
        entityType: "CommunitySupportPlan",
        entityId: plan.id,
        afterState: { status: updated.status },
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: plan.member.userId,
      type: "PLAN_REGISTRATION",
      title:
        stage === "COORDINATOR"
          ? "Coordinator approved your plan"
          : "Community Support Plan is active",
      body:
        stage === "COORDINATOR"
          ? "Your plan is now awaiting final Foundation Admin approval."
          : "Your Community Support Plan is active. The initial six-month waiting period is now in effect.",
      template: stage === "COORDINATOR" ? "PLAN_COORDINATOR_APPROVED" : "PLAN_ADMIN_APPROVED",
      relatedExternalId: updated.externalId,
      idempotencyKey: `plan:${updated.id}:${stage.toLowerCase()}-approved`,
    });
    return updated;
  });
}

export async function extendPlanDue(
  externalDueId: string,
  actorId: string,
  dueAt: Date,
  reason: string,
) {
  if (!reason.trim() || dueAt <= new Date())
    throw new Error("A reason and future expiry are required");
  return runSerializablePaymentTransaction(async (tx) => {
    const due = await tx.due.findUnique({
      where: { externalId: externalDueId },
      include: {
        member: { select: { userId: true, status: true } },
        plan: { select: { status: true } },
      },
    });
    if (
      !due ||
      due.purpose !== "PLAN_REGISTRATION" ||
      !["PENDING", "OVERDUE", "EXPIRED"].includes(due.status) ||
      due.plan?.status !== "PAYMENT_PENDING" ||
      ["CLOSED", "DECEASED"].includes(due.member.status)
    )
      throw new Error("Plan registration due not found or already settled");
    if (dueAt <= due.dueAt)
      throw new Error("The extended deadline must be later than the existing deadline");
    // An extension is the explicit Admin authorization that makes an expired
    // ₹1,000 obligation payable again; it also starts a fresh reminder cadence.
    const updated = await tx.due.update({
      where: { id: due.id },
      data: { dueAt, status: "PENDING", lastReminderAt: null },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "PLAN_DUE_EXTENDED",
        entityType: "Due",
        entityId: due.id,
        reason: reason.trim(),
        beforeState: { dueAt: due.dueAt.toISOString(), status: due.status },
        afterState: { dueAt: updated.dueAt.toISOString(), status: updated.status },
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: due.member.userId,
      type: "PLAN_EXPIRY",
      title: "Plan payment deadline extended",
      body: "A Foundation Admin extended your ₹1,000 plan registration payment deadline. Review the updated deadline in your member portal.",
      template: "PLAN_DUE_EXTENDED",
      relatedExternalId: updated.externalId,
      payload: { dueExternalId: updated.externalId },
      idempotencyKey: `plan-due-extension:${updated.id}:${updated.dueAt.toISOString()}`,
    });
    return updated;
  });
}

export const PLAN_PAYABLE_STATUSES: PlanStatus[] = ["PAYMENT_PENDING"];
