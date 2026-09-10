import { Prisma, PlanStatus } from "@prisma/client";
import { MONEY } from "../../domain/money";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";

const sixMonthsFrom = (from: Date) => {
  const result = new Date(from);
  result.setUTCMonth(result.getUTCMonth() + 6);
  return result;
};

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
      select: { status: true },
    });
    if (!member) throw new Error("Member not found");
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
        amountPaise: MONEY.planRegistration,
        dueAt: new Date(Date.now() + 30 * 86400000),
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
    return { plan, due };
  });
}

/** Called only from the payment settlement transaction after the plan due is paid. */
export async function advancePlanAfterRegistrationPayment(
  tx: Prisma.TransactionClient,
  planId: string,
) {
  const plan = await tx.communitySupportPlan.findUniqueOrThrow({ where: { id: planId } });
  if (plan.status === "PAYMENT_PENDING") {
    return tx.communitySupportPlan.update({
      where: { id: plan.id },
      data: { status: "PENDING_COORDINATOR_APPROVAL" },
    });
  }
  return plan;
}

export async function approvePlan(
  externalPlanId: string,
  actorId: string,
  stage: "COORDINATOR" | "ADMIN",
) {
  return runSerializablePaymentTransaction(async (tx) => {
    const plan = await tx.communitySupportPlan.findUnique({
      where: { externalId: externalPlanId },
      include: { member: { select: { coordinatorId: true, status: true } } },
    });
    if (!plan) throw new Error("Plan not found");
    if (stage === "COORDINATOR") {
      if (plan.status !== "PENDING_COORDINATOR_APPROVAL")
        throw new Error("Plan is not ready for Coordinator approval");
      const coordinator = await tx.coordinator.findFirst({
        where: { member: { userId: actorId }, isSuspended: false, status: "ACTIVE" },
        select: { id: true },
      });
      if (!coordinator || coordinator.id !== plan.member.coordinatorId)
        throw new Error("Coordinator is not assigned to this member");
      await tx.communitySupportPlan.update({
        where: { id: plan.id },
        data: { status: "PENDING_ADMIN_APPROVAL" },
      });
    } else {
      if (plan.status !== "PENDING_ADMIN_APPROVAL")
        throw new Error("Plan is not ready for Admin approval");
      const now = new Date();
      await tx.communitySupportPlan.update({
        where: { id: plan.id },
        data: { status: "ACTIVE", activatedAt: now, waitingEndsAt: sixMonthsFrom(now) },
      });
      // CLOSED is deliberately different from ordinary INACTIVE reactivation:
      // it becomes ACTIVE only after a brand-new ₹1,000 registration has made
      // it through both approval stages.
      if (plan.member.status === "CLOSED") {
        await tx.member.update({
          where: { id: plan.memberId },
          data: { status: "ACTIVE", closedAt: null },
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
        entityType: "CommunitySupportPlan",
        entityId: plan.id,
        afterState: { status: updated.status },
      },
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
    const due = await tx.due.findUnique({ where: { externalId: externalDueId } });
    if (!due || due.purpose !== "PLAN_REGISTRATION" || due.status === "PAID")
      throw new Error("Plan registration due not found or already settled");
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
    return updated;
  });
}

export const PLAN_PAYABLE_STATUSES: PlanStatus[] = ["PAYMENT_PENDING"];
