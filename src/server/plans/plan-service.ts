import { Prisma, PlanStatus } from "@prisma/client";
import { MONEY } from "../../domain/money";
import { prisma } from "../database/prisma";

const sixMonthsFrom = (from: Date) => {
  const result = new Date(from);
  result.setUTCMonth(result.getUTCMonth() + 6);
  return result;
};

export async function startPlanRegistration(memberId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.member.findUnique({
      where: { id: memberId },
      select: { status: true },
    });
    if (!member) throw new Error("Member not found");
    const existing = await tx.communitySupportPlan.findFirst({
      where: {
        memberId,
        status: {
          in: [
            "ACTIVE",
            "PAYMENT_PENDING",
            "PENDING_COORDINATOR_APPROVAL",
            "PENDING_ADMIN_APPROVAL",
          ],
        },
      },
    });
    // A normal inactive member retains the prior plan. Only a CLOSED member
    // begins a new ₹1,000 registration after reopening.
    if (existing && member.status !== "CLOSED")
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
  return prisma.$transaction(async (tx) => {
    const plan = await tx.communitySupportPlan.findUnique({
      where: { externalId: externalPlanId },
      include: { member: { select: { coordinatorId: true } } },
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
  return prisma.$transaction(async (tx) => {
    const due = await tx.due.findUnique({ where: { externalId: externalDueId } });
    if (!due || due.purpose !== "PLAN_REGISTRATION" || due.status === "PAID")
      throw new Error("Plan registration due not found or already settled");
    const updated = await tx.due.update({ where: { id: due.id }, data: { dueAt } });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "PLAN_DUE_EXTENDED",
        entityType: "Due",
        entityId: due.id,
        reason: reason.trim(),
        beforeState: { dueAt: due.dueAt.toISOString() },
        afterState: { dueAt: updated.dueAt.toISOString() },
      },
    });
    return updated;
  });
}

export const PLAN_PAYABLE_STATUSES: PlanStatus[] = ["PAYMENT_PENDING"];
