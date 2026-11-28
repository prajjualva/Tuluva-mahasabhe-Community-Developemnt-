import { z } from "zod";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";
import { applyCoordinatorFeeExemption } from "../coordinators/fee-exemption-service";
import { suspendCoordinatorInTransaction } from "../coordinators/coordinator-management-service";
import {
  coordinatorAppointmentState,
  CoordinatorAppointmentError,
} from "../../domain/coordinator-appointment";
import { prisma } from "../database/prisma";
import { getPaymentProvider, type PaymentProvider } from "../payments/payment-provider";

const reasonSchema = z.string().trim().min(3).max(1000);
export async function createCoordinatorProfile(
  actorId: string,
  input: unknown,
  providerOverride?: Pick<PaymentProvider, "assertOrderUnpaid">,
) {
  const command = z
    .object({
      memberExternalId: z.string().uuid(),
      referralCode: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{6,16}$/),
      reason: reasonSchema,
      applyFeeExemption: z.literal(true),
      idempotencyKey: z.string().uuid(),
    })
    .strict()
    .parse(input);
  const completed = await prisma.auditLog.findFirst({
    where: {
      action: "COORDINATOR_APPOINTED",
      actorId,
      afterState: { path: ["idempotencyKey"], equals: command.idempotencyKey },
    },
    select: { entityId: true, afterState: true, reason: true },
  });
  if (completed) {
    const previous = completed.afterState as Record<string, unknown>;
    if (
      previous.memberExternalId !== command.memberExternalId ||
      previous.referralCode !== command.referralCode ||
      completed.reason !== command.reason
    )
      throw new CoordinatorAppointmentError(
        "ALREADY_COORDINATOR",
        "This request reference was already used. Refresh the member profile.",
      );
    return prisma.coordinator.findUniqueOrThrow({
      where: { id: completed.entityId },
      select: { externalId: true, referralCode: true, status: true },
    });
  }
  // Read real gateway evidence outside the financial transaction. Retain open
  // orders so a later signed capture is recorded as unapplied funds for review.
  const pending = await prisma.payment.findMany({
    where: {
      member: { externalId: command.memberExternalId },
      status: "PENDING",
      due: { purpose: { in: ["MEMBERSHIP", "PLAN_REGISTRATION"] } },
    },
    select: {
      id: true,
      externalId: true,
      method: true,
      amountPaise: true,
      providerOrderId: true,
      due: {
        select: { payments: { where: { status: "SUCCEEDED" }, select: { externalId: true } } },
      },
    },
    take: 6,
  });
  const paymentBlocked = () =>
    new CoordinatorAppointmentError(
      "FEES_PENDING",
      "A pending payment could not be confirmed unpaid. Reconcile received funds, partial wallet payments or cash collections before appointment. No exemption or appointment was applied.",
    );
  if (pending.length > 5 || pending.some((p) => p.method !== "ONLINE" || p.due?.payments.length))
    throw paymentBlocked();
  for (const payment of pending) {
    if (!payment.providerOrderId) continue;
    const configured = providerOverride
      ? { available: true as const, provider: providerOverride }
      : getPaymentProvider({ ...process.env, PAYMENT_PROVIDER: "razorpay" });
    if (!configured.available) throw paymentBlocked();
    try {
      await configured.provider.assertOrderUnpaid(payment.providerOrderId, payment.amountPaise);
    } catch {
      throw paymentBlocked();
    }
  }
  return runSerializablePaymentTransaction(
    async (tx) => {
      const replay = await tx.auditLog.findFirst({
        where: {
          action: "COORDINATOR_APPOINTED",
          actorId,
          afterState: { path: ["idempotencyKey"], equals: command.idempotencyKey },
        },
        select: { entityId: true, afterState: true, reason: true },
      });
      if (replay) {
        const previous = replay.afterState as Record<string, unknown>;
        if (
          previous.memberExternalId !== command.memberExternalId ||
          previous.referralCode !== command.referralCode ||
          replay.reason !== command.reason
        )
          throw new CoordinatorAppointmentError(
            "ALREADY_COORDINATOR",
            "This request reference was already used. Refresh the member profile.",
          );
        return tx.coordinator.findUniqueOrThrow({
          where: { id: replay.entityId },
          select: { externalId: true, referralCode: true, status: true },
        });
      }
      const member = await tx.member.findUnique({
        where: { externalId: command.memberExternalId },
        select: {
          id: true,
          userId: true,
          status: true,
          coordinatorProfile: { select: { id: true } },
        },
      });
      if (!member)
        throw new CoordinatorAppointmentError(
          "MEMBER_UNAVAILABLE",
          "Member is unavailable for appointment.",
        );
      const state = coordinatorAppointmentState({
        memberStatus: member.status,
        hasCoordinatorProfile: Boolean(member.coordinatorProfile),
        pendingFeePayments: 0,
      });
      if (state.code !== "READY") throw new CoordinatorAppointmentError(state.code, state.message);
      if (
        await tx.coordinator.findUnique({
          where: { referralCode: command.referralCode },
          select: { externalId: true },
        })
      )
        throw new CoordinatorAppointmentError(
          "REFERRAL_CODE_TAKEN",
          "This referral code is already in use. Choose another code.",
        );
      const role = await tx.role.findUniqueOrThrow({ where: { code: "COORDINATOR" } });
      const memberRole = await tx.role.findUniqueOrThrow({ where: { code: "MEMBER" } });
      const current = await tx.payment.findMany({
        where: {
          memberId: member.id,
          status: "PENDING",
          due: { purpose: { in: ["MEMBERSHIP", "PLAN_REGISTRATION"] } },
        },
        select: {
          id: true,
          method: true,
          amountPaise: true,
          providerOrderId: true,
          due: {
            select: { payments: { where: { status: "SUCCEEDED" }, select: { externalId: true } } },
          },
        },
      });
      if (
        current.length !== pending.length ||
        current.some((p) => {
          const verified = pending.find((row) => row.id === p.id);
          return (
            !verified ||
            verified.providerOrderId !== p.providerOrderId ||
            verified.amountPaise !== p.amountPaise ||
            p.method !== "ONLINE" ||
            Boolean(p.due?.payments.length)
          );
        })
      )
        throw paymentBlocked();
      await applyCoordinatorFeeExemption(
        tx,
        member.id,
        actorId,
        command.reason,
        new Date(),
        current.map((p) => p.id),
      );
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
        data: {
          coordinatorId: coordinator.id,
          action: "APPOINTED",
          actorId,
          reason: command.reason,
        },
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
            idempotencyKey: command.idempotencyKey,
            feeExemptionConfirmed: true,
            verifiedUnpaidOnlinePayments: pending.map((p) => p.externalId),
          },
        },
      });
      await createInAppNotificationInTransaction(tx, {
        userId: member.userId,
        type: "SYSTEM",
        title: "Coordinator appointment",
        body: "The Foundation appointed you as a Coordinator. Your referral code and assigned services are available in the Coordinator console.",
        template: "COORDINATOR_APPOINTMENT",
        relatedExternalId: coordinator.externalId,
        idempotencyKey: `coordinator-appointment:${coordinator.id}`,
      });
      return {
        externalId: coordinator.externalId,
        referralCode: coordinator.referralCode,
        status: coordinator.status,
      };
    },
    { timeoutMs: 60000 },
  );
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
