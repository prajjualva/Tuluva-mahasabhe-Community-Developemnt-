import { prisma } from "../database/prisma";

export class MembershipCardPaymentRequiredError extends Error {
  constructor() {
    super("Complete your membership payment before viewing your ID card");
  }
}

export function membershipCardPaymentSatisfied(
  member: {
    coordinatorProfile: unknown;
    membershipGrants: unknown[];
    dues: Array<{ status: string; payments: unknown[] }>;
  } | null,
) {
  return (
    !!member &&
    (!!member.coordinatorProfile ||
      member.membershipGrants.length > 0 ||
      (member.dues[0]?.status === "PAID" && member.dues[0].payments.length > 0))
  );
}

export async function canReadMemberIdCard(userId: string) {
  const member = await prisma.member.findUnique({
    where: { userId },
    select: {
      coordinatorProfile: { select: { id: true } },
      membershipGrants: { select: { id: true }, take: 1 },
      dues: {
        where: { purpose: "MEMBERSHIP" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 1,
        select: {
          status: true,
          payments: {
            where: {
              status: "SUCCEEDED",
              OR: [{ refund: { is: null } }, { refund: { status: { not: "SUCCEEDED" } } }],
            },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });
  return membershipCardPaymentSatisfied(member);
}
