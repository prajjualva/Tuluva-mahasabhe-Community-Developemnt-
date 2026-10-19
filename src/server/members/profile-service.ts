import { z } from "zod";
import { prisma } from "../database/prisma";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { changeMemberCoordinator } from "../coordinators/coordinator-management-service";

const profileSelect = {
  externalId: true,
  fullName: true,
  address: true,
  status: true,
  joinedAt: true,
  user: {
    select: {
      externalId: true,
      email: true,
      mobile: true,
      emailVerifiedAt: true,
      mobileVerifiedAt: true,
    },
  },
  coordinator: {
    select: {
      externalId: true,
      referralCode: true,
      status: true,
      member: { select: { fullName: true } },
    },
  },
  nominees: { where: { isCurrent: true }, select: { kind: true, fullName: true, status: true } },
} as const;
export async function readOwnProfile(userId: string) {
  const profile = await prisma.member.findUnique({ where: { userId }, select: profileSelect });
  if (!profile) throw new Error("Member not found");
  return profile;
}
export async function updateOwnProfile(userId: string, input: unknown) {
  const command = z
    .object({
      fullName: z.string().trim().min(2).max(160),
      address: z.string().trim().min(5).max(1000),
    })
    .strict()
    .parse(input);
  return runSerializablePaymentTransaction(async (tx) => {
    const member = await tx.member.findUniqueOrThrow({ where: { userId } });
    if (member.status === "DECEASED") throw new Error("Profile changes are unavailable");
    const result = await tx.member.update({
      where: { id: member.id },
      data: command,
      select: profileSelect,
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "MEMBER_PROFILE_UPDATED",
        entityType: "Member",
        entityId: member.id,
        beforeState: { fullName: member.fullName, address: member.address },
        afterState: command,
      },
    });
    return result;
  });
}
export async function listActiveCoordinatorChoices() {
  return prisma.coordinator.findMany({
    where: {
      status: "ACTIVE",
      isSuspended: false,
      member: { status: { notIn: ["CLOSED", "DECEASED"] } },
    },
    select: { externalId: true, referralCode: true, member: { select: { fullName: true } } },
    orderBy: { referralCode: "asc" },
    take: 500,
  });
}
export async function changeOwnCoordinator(userId: string, input: unknown) {
  const command = z
    .object({
      coordinatorExternalId: z.string().uuid(),
      reason: z.string().trim().min(3).max(1000),
    })
    .strict()
    .parse(input);
  const member = await prisma.member.findUniqueOrThrow({
    where: { userId },
    select: { externalId: true, status: true },
  });
  if (member.status === "DECEASED") throw new Error("Coordinator change is unavailable");
  return changeMemberCoordinator({
    actorId: userId,
    memberExternalId: member.externalId,
    replacementCoordinatorExternalId: command.coordinatorExternalId,
    reason: command.reason,
  });
}
