import { z } from "zod";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";
import { applyCoordinatorFeeExemption } from "../coordinators/fee-exemption-service";
import { suspendCoordinatorInTransaction } from "../coordinators/coordinator-management-service";

const reasonSchema = z.string().trim().min(3).max(1000);
export async function createCoordinatorProfile(actorId: string, input: unknown) {
  const command = z
    .object({
      memberExternalId: z.string().uuid(),
      referralCode: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{6,16}$/),
      reason: reasonSchema,
    })
    .strict()
    .parse(input);
  return runSerializablePaymentTransaction(async (tx) => {
    const member = await tx.member.findUnique({
      where: { externalId: command.memberExternalId },
      select: {
        id: true,
        userId: true,
        status: true,
        coordinatorProfile: { select: { id: true } },
      },
    });
    if (!member || member.status === "DECEASED" || member.status === "CLOSED")
      throw new Error("Member is unavailable for Coordinator appointment");
    if (member.coordinatorProfile) throw new Error("Member already has a Coordinator profile");
    const role = await tx.role.findUniqueOrThrow({ where: { code: "COORDINATOR" } });
    const memberRole = await tx.role.findUniqueOrThrow({ where: { code: "MEMBER" } });
    await applyCoordinatorFeeExemption(tx, member.id, actorId, command.reason);
    const coordinator = await tx.coordinator.create({
      data: { memberId: member.id, referralCode: command.referralCode },
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: member.userId, roleId: role.id } },
      create: { userId: member.userId, roleId: role.id },
      update: { active: true, assignedAt: new Date() },
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: member.userId, roleId: memberRole.id } },
      create: { userId: member.userId, roleId: memberRole.id },
      update: { active: true },
    });
    await tx.coordinatorLifecycleEvent.create({
      data: { coordinatorId: coordinator.id, action: "APPOINTED", actorId, reason: command.reason },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "COORDINATOR_APPOINTED",
        entityType: "Coordinator",
        entityId: coordinator.id,
        reason: command.reason,
        afterState: {
          coordinatorExternalId: coordinator.externalId,
          memberExternalId: command.memberExternalId,
          referralCode: command.referralCode,
        },
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: member.userId,
      type: "SYSTEM",
      title: "Coordinator appointment",
      body: "The Foundation appointed you as a Coordinator. Your referral code and assigned services are available in the Coordinator console.",
      relatedExternalId: coordinator.externalId,
      idempotencyKey: `coordinator-appointment:${coordinator.id}`,
    });
    return {
      externalId: coordinator.externalId,
      referralCode: coordinator.referralCode,
      status: coordinator.status,
    };
  });
}

export async function changeUserRole(actorId: string, userExternalId: string, input: unknown) {
  z.string().uuid().parse(userExternalId);
  const command = z
    .object({
      roleCode: z.enum(["ADMIN", "COORDINATOR", "MEMBER"]),
      active: z.boolean(),
      reason: reasonSchema,
    })
    .strict()
    .parse(input);
  return runSerializablePaymentTransaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { externalId: userExternalId },
      include: { member: { include: { coordinatorProfile: true } } },
    });
    if (
      command.active &&
      command.roleCode === "COORDINATOR" &&
      (!user.member?.coordinatorProfile ||
        user.member.coordinatorProfile.isSuspended ||
        user.member.coordinatorProfile.status !== "ACTIVE")
    )
      throw new Error("An active Coordinator profile is required before granting this role");
    if (command.roleCode === "MEMBER" && !user.member)
      throw new Error("Member profile is required");
    if (!command.active && command.roleCode === "ADMIN") {
      if (user.id === actorId)
        throw new Error("Use another Admin account to revoke your own administrative role");
      const remaining = await tx.userRole.count({
        where: {
          role: { code: "ADMIN" },
          active: true,
          userId: { not: user.id },
          user: { status: "ACTIVE" },
        },
      });
      if (!remaining) throw new Error("The last active Administrator cannot be removed");
    }
    const role = await tx.role.findUniqueOrThrow({ where: { code: command.roleCode } });
    if (
      !command.active &&
      command.roleCode === "COORDINATOR" &&
      user.member?.coordinatorProfile &&
      !user.member.coordinatorProfile.isSuspended
    ) {
      await suspendCoordinatorInTransaction(tx, {
        actorId,
        coordinatorExternalId: user.member.coordinatorProfile.externalId,
        reason: command.reason,
        mode: "FOUNDATION_ADMIN",
      });
    }
    const prior = await tx.userRole.findUnique({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id, active: command.active },
      update: { active: command.active, assignedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "ADMIN_ROLE_ASSIGNMENT_CHANGED",
        entityType: "User",
        entityId: user.id,
        reason: command.reason,
        beforeState: { roleCode: role.code, active: prior?.active ?? false },
        afterState: { roleCode: role.code, active: command.active },
      },
    });
    return { userExternalId, roleCode: role.code, active: command.active };
  });
}
