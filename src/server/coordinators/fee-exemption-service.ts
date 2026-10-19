import { Prisma } from "@prisma/client";
import { effectiveSchemeNumber } from "../database/scheme-policy";
import { addUtcCalendarMonths } from "../../domain/calendar";

/** Appointment exempts ₹369/₹1,000 fees; the Coordinator's ₹100 obligations are untouched. */
export async function applyCoordinatorFeeExemption(
  tx: Prisma.TransactionClient,
  memberId: string,
  actorId: string | null,
  reason: string,
  now = new Date(),
) {
  const pendingFeePayment = await tx.payment.count({
    where: {
      memberId,
      status: "PENDING",
      due: { purpose: { in: ["MEMBERSHIP", "PLAN_REGISTRATION"] } },
    },
  });
  if (pendingFeePayment)
    throw new Error("Resolve pending membership/plan payments before Coordinator appointment");
  const waived = await tx.due.updateMany({
    where: {
      memberId,
      purpose: { in: ["MEMBERSHIP", "PLAN_REGISTRATION"] },
      status: { in: ["PENDING", "OVERDUE", "EXPIRED"] },
    },
    data: { status: "WAIVED" },
  });
  const active = await tx.communitySupportPlan.findFirst({
    where: { memberId, status: { in: ["ACTIVE", "SUSPENDED"] } },
  });
  if (!active) {
    const member = await tx.member.findUniqueOrThrow({
      where: { id: memberId },
      select: { status: true },
    });
    const months = await effectiveSchemeNumber(tx, "initialWaitingMonths", now);
    await tx.communitySupportPlan.updateMany({
      where: {
        memberId,
        status: {
          in: ["PAYMENT_PENDING", "PENDING_COORDINATOR_APPROVAL", "PENDING_ADMIN_APPROVAL"],
        },
      },
      data: { status: "CANCELLED" },
    });
    await tx.communitySupportPlan.create({
      data: {
        memberId,
        status: member.status === "INACTIVE" ? "SUSPENDED" : "ACTIVE",
        activatedAt: now,
        waitingEndsAt: addUtcCalendarMonths(now, months),
      },
    });
  }
  await tx.auditLog.create({
    data: {
      actorId,
      action: "COORDINATOR_MEMBERSHIP_AND_PLAN_FEE_EXEMPTION",
      entityType: "Member",
      entityId: memberId,
      reason,
      afterState: { waivedFeeDues: waived.count, contributionObligationsPreserved: true },
    },
  });
}
