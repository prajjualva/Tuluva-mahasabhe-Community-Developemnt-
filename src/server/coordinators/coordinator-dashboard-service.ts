import { prisma } from "../database/prisma";

export async function coordinatorDashboardSnapshot(userId: string) {
  const coordinator = await prisma.coordinator.findFirst({
    where: {
      member: { userId, status: { notIn: ["CLOSED", "DECEASED"] } },
      status: "ACTIVE",
      isSuspended: false,
    },
    select: { id: true, referralCode: true },
  });
  if (!coordinator) throw new Error("Coordinator access is unavailable");
  const scope = { coordinatorId: coordinator.id };
  const [
    assignedMembers,
    pendingDues,
    expiredDues,
    nomineeVerifications,
    deathReports,
    cashAwaitingVerification,
    members,
  ] = await Promise.all([
    prisma.member.count({ where: scope }),
    prisma.due.count({ where: { member: scope, status: { in: ["PENDING", "OVERDUE"] } } }),
    prisma.due.count({ where: { member: scope, status: "EXPIRED" } }),
    prisma.nominee.count({ where: { member: scope, status: "PENDING_VERIFICATION" } }),
    prisma.deathCase.count({ where: { member: scope, status: "REPORTED" } }),
    prisma.cashCollection.count({
      where: {
        coordinatorId: coordinator.id,
        status: { in: ["RECEIVED_BY_COORDINATOR", "PENDING_ADMIN_VERIFICATION"] },
      },
    }),
    prisma.member.findMany({
      where: scope,
      orderBy: { fullName: "asc" },
      take: 100,
      select: { externalId: true, fullName: true, status: true },
    }),
  ]);
  return {
    referralCode: coordinator.referralCode,
    assignedMembers,
    pendingDues,
    expiredDues,
    nomineeVerifications,
    deathReports,
    cashAwaitingVerification,
    members,
  };
}
