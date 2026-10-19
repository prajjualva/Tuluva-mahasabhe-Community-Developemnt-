import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { ensureMembershipBillsInTransaction } from "./membership-lifecycle-service";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";

/** Restores a normal inactive membership only after every due, including current ₹369, is settled. */
export async function reactivateMembership(memberId: string, actorId: string) {
  return runSerializablePaymentTransaction(async (tx) => {
    const member = await tx.member.findUniqueOrThrow({
      where: { id: memberId },
      include: { coordinatorProfile: { select: { id: true } } },
    });
    if (member.status !== "INACTIVE")
      throw new Error("Only an inactive membership can be reactivated");
    const billing = await ensureMembershipBillsInTransaction(tx, memberId);
    const outstanding = await tx.due.count({
      where: { memberId, status: { in: ["PENDING", "OVERDUE", "EXPIRED"] } },
    });
    if (outstanding > 0)
      throw new Error(
        "All outstanding dues and the current membership payment must be settled first",
      );
    const currentMembershipPayment = await tx.due.findFirst({
      where: {
        memberId,
        purpose: "MEMBERSHIP",
        status: "PAID",
        id: billing.currentDueId ?? "00000000-0000-0000-0000-000000000000",
        payments: {
          some: {
            status: "SUCCEEDED",
            OR: [{ refund: { is: null } }, { refund: { status: { not: "SUCCEEDED" } } }],
          },
        },
      },
      orderBy: { paidAt: "desc" },
      select: { id: true },
    });
    if (!member.coordinatorProfile && !currentMembershipPayment)
      throw new Error("Current membership payment is required");
    const updated = await tx.member.update({
      where: { id: memberId },
      data: { status: "ACTIVE", closedAt: null },
    });
    const reactivatedAt = new Date();
    await tx.membership.updateMany({
      where: { memberId, endedAt: null },
      data: { endedAt: reactivatedAt },
    });
    await tx.membership.create({
      data: { memberId, status: "ACTIVE", startedAt: reactivatedAt },
    });
    // Resume the original plan and its original waiting-period dates. Normal
    // reactivation never creates another ₹1,000 registration or waiting period.
    await tx.communitySupportPlan.updateMany({
      where: { memberId, status: "SUSPENDED" },
      data: { status: "ACTIVE" },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "MEMBERSHIP_REACTIVATED",
        entityType: "Member",
        entityId: memberId,
        afterState: { status: "ACTIVE" },
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: member.userId,
      type: "SYSTEM",
      title: "Membership reactivated",
      body: "All required outstanding dues and the current ₹369 membership payment have been recorded. Your membership is active again.",
      template: "MEMBERSHIP_REACTIVATED",
      relatedExternalId: member.externalId,
      idempotencyKey: `membership-reactivated:${member.id}:${reactivatedAt.toISOString()}`,
    });
    return updated;
  });
}
