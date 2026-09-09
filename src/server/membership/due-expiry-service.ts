import { prisma } from "../database/prisma";
import { shouldMarkMembershipInactive } from "./membership-engine";

/** Applies durable expiry and the six-expired-contribution membership rule. */
export async function processMembershipDueExpiry(now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.due.findMany({
      where: { status: { in: ["PENDING", "OVERDUE"] }, dueAt: { lte: now } },
      select: { id: true, memberId: true },
    });
    if (!candidates.length) return { expiredDues: 0, inactivatedMembers: 0 };
    await tx.due.updateMany({
      where: {
        id: { in: candidates.map((due) => due.id) },
        status: { in: ["PENDING", "OVERDUE"] },
      },
      data: { status: "EXPIRED" },
    });
    let inactivatedMembers = 0;
    for (const memberId of new Set(candidates.map((due) => due.memberId))) {
      const member = await tx.member.findUnique({
        where: { id: memberId },
        select: { status: true },
      });
      if (!member || member.status === "DECEASED" || member.status === "CLOSED") continue;
      const [expiredContributionCount, expiredMembershipCount] = await Promise.all([
        tx.due.count({ where: { memberId, purpose: "CONTRIBUTION", status: "EXPIRED" } }),
        tx.due.count({ where: { memberId, purpose: "MEMBERSHIP", status: "EXPIRED" } }),
      ]);
      if (
        !shouldMarkMembershipInactive(expiredContributionCount, expiredMembershipCount > 0) ||
        member.status === "INACTIVE"
      )
        continue;
      await tx.member.update({ where: { id: memberId }, data: { status: "INACTIVE" } });
      await tx.auditLog.create({
        data: {
          actorRole: "SYSTEM",
          action: "MEMBERSHIP_MARKED_INACTIVE",
          entityType: "Member",
          entityId: memberId,
          afterState: { expiredContributionCount, expiredMembershipCount, status: "INACTIVE" },
        },
      });
      inactivatedMembers += 1;
    }
    return { expiredDues: candidates.length, inactivatedMembers };
  });
}
