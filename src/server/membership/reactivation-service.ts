import { prisma } from "../database/prisma";

/** Restores a normal inactive membership only after every due, including current ₹369, is settled. */
export async function reactivateMembership(memberId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.member.findUniqueOrThrow({ where: { id: memberId } });
    if (member.status !== "INACTIVE")
      throw new Error("Only an inactive membership can be reactivated");
    const outstanding = await tx.due.count({
      where: { memberId, status: { in: ["PENDING", "OVERDUE", "EXPIRED"] } },
    });
    if (outstanding > 0)
      throw new Error(
        "All outstanding dues and the current membership payment must be settled first",
      );
    const currentMembershipPayment = await tx.due.findFirst({
      where: { memberId, purpose: "MEMBERSHIP", status: "PAID" },
      orderBy: { paidAt: "desc" },
      select: { id: true },
    });
    if (!currentMembershipPayment) throw new Error("Current membership payment is required");
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
    await tx.auditLog.create({
      data: {
        actorId,
        action: "MEMBERSHIP_REACTIVATED",
        entityType: "Member",
        entityId: memberId,
        afterState: { status: "ACTIVE" },
      },
    });
    return updated;
  });
}
