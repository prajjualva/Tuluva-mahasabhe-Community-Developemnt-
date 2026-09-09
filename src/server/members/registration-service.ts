import { prisma } from "../database/prisma";
import { hashPassword } from "../auth/password";
import { registrationInput, type RegistrationInput } from "./member-service";
import { MONEY } from "../../domain/money";

const threeMonthsFrom = (from: Date) => {
  const result = new Date(from);
  result.setUTCMonth(result.getUTCMonth() + 3);
  return result;
};

/** Creates identity, member, membership history, and first ₹369 due atomically. */
export async function registerMemberPersistently(raw: RegistrationInput) {
  const input = registrationInput.parse(raw);
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const coordinator = await tx.coordinator.findFirst({
      where: {
        referralCode: input.referralCode.toUpperCase(),
        isSuspended: false,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!coordinator) throw new Error("Referral code is invalid or inactive");
    const memberRole = await tx.role.findUnique({
      where: { code: "MEMBER" },
      select: { id: true },
    });
    if (!memberRole) throw new Error("Member role is not configured");
    const user = await tx.user.create({
      data: { email: input.email, mobile: input.mobile, passwordHash },
    });
    const member = await tx.member.create({
      data: {
        userId: user.id,
        coordinatorId: coordinator.id,
        fullName: input.fullName,
        address: input.address,
      },
    });
    const membership = await tx.membership.create({
      data: { memberId: member.id, status: "ACTIVE" },
    });
    await tx.membershipPeriod.create({
      data: { membershipId: membership.id, startsAt: new Date() },
    });
    const due = await tx.due.create({
      data: {
        memberId: member.id,
        purpose: "MEMBERSHIP",
        amountPaise: MONEY.membershipFee,
        dueAt: threeMonthsFrom(new Date()),
      },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: memberRole.id } });
    await tx.auditLog.create({
      data: {
        actorRole: "SYSTEM",
        action: "MEMBER_REGISTERED",
        entityType: "Member",
        entityId: member.id,
        afterState: {
          memberExternalId: member.externalId,
          membershipDueExternalId: due.externalId,
        },
      },
    });
    return {
      memberExternalId: member.externalId,
      membershipDueExternalId: due.externalId,
      membershipDueAt: due.dueAt,
    };
  });
}
