import { Prisma } from "@prisma/client";
import { z } from "zod";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";
import { prisma } from "../database/prisma";
import { reconcileSuspendedCoordinator } from "./cash-reconciliation-service";

const uuid = z.string().uuid();
const reason = z.string().trim().min(3).max(1_000);

const safeCoordinatorSelect = {
  externalId: true,
  referralCode: true,
  status: true,
  isSuspended: true,
  suspendedAt: true,
  member: { select: { externalId: true, fullName: true } },
  _count: { select: { assignedMembers: true } },
} satisfies Prisma.CoordinatorSelect;

export async function listCoordinatorsForAdmin() {
  return prisma.coordinator.findMany({
    select: safeCoordinatorSelect,
    orderBy: [{ status: "asc" }, { referralCode: "asc" }],
    take: 500,
  });
}

export async function coordinatorOperationalDetail(externalId: string) {
  uuid.parse(externalId);
  const coordinator = await prisma.coordinator.findUnique({
    where: { externalId },
    select: {
      id: true,
      ...safeCoordinatorSelect,
      assignedMembers: { select: { externalId: true, fullName: true, status: true }, take: 100 },
      cashCollections: {
        select: {
          externalId: true,
          receiptNumber: true,
          amountPaise: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      lifecycleEvents: {
        select: { action: true, reason: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      _count: { select: { assignedMembers: true, referrals: true } },
    },
  });
  if (!coordinator) throw new Error("Coordinator not found");
  const transfers = await prisma.coordinatorTransfer.findMany({
    where: { OR: [{ fromCoordinatorId: coordinator.id }, { toCoordinatorId: coordinator.id }] },
    select: {
      effectiveAt: true,
      reason: true,
      member: { select: { externalId: true, fullName: true } },
    },
    orderBy: { effectiveAt: "desc" },
    take: 100,
  });
  const { id: internalId, ...safe } = coordinator;
  void internalId;
  return { ...safe, transfers };
}

async function getActiveReplacement(
  tx: Prisma.TransactionClient,
  replacementCoordinatorExternalId: string,
  originalCoordinatorId: string,
) {
  const replacement = await tx.coordinator.findFirst({
    where: {
      externalId: replacementCoordinatorExternalId,
      id: { not: originalCoordinatorId },
      isSuspended: false,
      status: "ACTIVE",
      member: { status: { notIn: ["CLOSED", "DECEASED"] } },
    },
    select: { id: true, externalId: true, member: { select: { fullName: true, userId: true } } },
  });
  if (!replacement) throw new Error("Replacement Coordinator must be active");
  return replacement;
}

export async function suspendCoordinatorAndReassign(input: {
  actorId: string;
  coordinatorExternalId: string;
  reason: string;
  mode: "FOUNDATION_ADMIN" | "TRANSFER";
  replacementCoordinatorExternalId?: string;
}) {
  const parsed = z
    .object({
      actorId: uuid,
      coordinatorExternalId: uuid,
      reason,
      mode: z.enum(["FOUNDATION_ADMIN", "TRANSFER"]),
      replacementCoordinatorExternalId: uuid.optional(),
    })
    .superRefine((value, context) => {
      if (value.mode === "TRANSFER" && !value.replacementCoordinatorExternalId)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Replacement Coordinator is required",
        });
    })
    .parse(input);

  return runSerializablePaymentTransaction((tx) => suspendCoordinatorInTransaction(tx, parsed));
}

export async function suspendCoordinatorInTransaction(
  tx: Prisma.TransactionClient,
  parsed: {
    actorId: string | null;
    coordinatorExternalId: string;
    reason: string;
    mode: "FOUNDATION_ADMIN" | "TRANSFER";
    replacementCoordinatorExternalId?: string;
  },
) {
  const coordinator = await tx.coordinator.findUnique({
    where: { externalId: parsed.coordinatorExternalId },
    include: {
      member: { select: { userId: true } },
      assignedMembers: { select: { id: true, externalId: true, userId: true } },
    },
  });
  if (!coordinator) throw new Error("Coordinator not found");
  if (coordinator.isSuspended || coordinator.status === "SUSPENDED")
    throw new Error("Coordinator is already suspended");
  const replacement =
    parsed.mode === "TRANSFER"
      ? await getActiveReplacement(tx, parsed.replacementCoordinatorExternalId!, coordinator.id)
      : null;
  const now = new Date();
  await tx.coordinator.update({
    where: { id: coordinator.id },
    data: { isSuspended: true, status: "SUSPENDED", suspendedAt: now },
  });
  const lifecycle = await tx.coordinatorLifecycleEvent.create({
    data: {
      coordinatorId: coordinator.id,
      action: "SUSPENDED",
      reason: parsed.reason,
      actorId: parsed.actorId,
    },
  });
  for (const member of coordinator.assignedMembers) {
    await tx.member.update({
      where: { id: member.id },
      data: { coordinatorId: replacement?.id ?? null },
    });
    await tx.coordinatorTransfer.create({
      data: {
        memberId: member.id,
        fromCoordinatorId: coordinator.id,
        toCoordinatorId: replacement?.id ?? null,
        reason: parsed.reason,
        actorId: parsed.actorId,
        effectiveAt: now,
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: member.userId,
      type:
        parsed.mode === "TRANSFER"
          ? "COORDINATOR_CHANGED"
          : "FOUNDATION_ADMIN_TEMPORARY_MANAGEMENT",
      title:
        parsed.mode === "TRANSFER"
          ? "Your Coordinator assignment changed"
          : "Foundation Admin is temporarily managing your account",
      body:
        parsed.mode === "TRANSFER"
          ? "The Foundation changed your Coordinator assignment. Your member services remain available."
          : "Your Coordinator is temporarily unavailable. Foundation Admin will manage Coordinator responsibilities until a return or reassignment is recorded.",
      template:
        parsed.mode === "TRANSFER"
          ? "COORDINATOR_CHANGED_AFTER_SUSPENSION"
          : "FOUNDATION_ADMIN_TEMPORARY_MANAGEMENT",
      relatedExternalId: member.externalId,
      idempotencyKey: `coordinator-suspension:${lifecycle.id}:member:${member.id}`,
    });
  }
  await createInAppNotificationInTransaction(tx, {
    userId: coordinator.member.userId,
    type: "COORDINATOR_SUSPENDED",
    title: "Coordinator access suspended",
    body: "Your Coordinator permissions are suspended. You cannot access Coordinator-only actions until the Foundation restores your role.",
    template: "COORDINATOR_SUSPENDED",
    relatedExternalId: coordinator.externalId,
    idempotencyKey: `coordinator-suspension:${lifecycle.id}`,
  });
  await tx.auditLog.create({
    data: {
      actorId: parsed.actorId,
      action: "COORDINATOR_SUSPENDED_AND_MEMBERS_REASSIGNED",
      entityType: "Coordinator",
      entityId: coordinator.id,
      reason: parsed.reason,
      afterState: {
        mode: parsed.mode,
        replacementCoordinatorExternalId: replacement?.externalId ?? null,
        affectedMemberCount: coordinator.assignedMembers.length,
      },
    },
  });
  await reconcileSuspendedCoordinator(tx, coordinator.id, parsed.actorId);
  return {
    coordinatorExternalId: coordinator.externalId,
    status: "SUSPENDED" as const,
    affectedMemberCount: coordinator.assignedMembers.length,
    mode: parsed.mode,
  };
}

export async function restoreCoordinator(input: {
  actorId: string;
  coordinatorExternalId: string;
  reason: string;
  returnTemporarilyManagedMembers?: boolean;
}) {
  const parsed = z
    .object({
      actorId: uuid,
      coordinatorExternalId: uuid,
      reason,
      returnTemporarilyManagedMembers: z.boolean().optional(),
    })
    .parse(input);
  return runSerializablePaymentTransaction(async (tx) => {
    const coordinator = await tx.coordinator.findUnique({
      where: { externalId: parsed.coordinatorExternalId },
      include: { member: { select: { userId: true, status: true } } },
    });
    if (!coordinator) throw new Error("Coordinator not found");
    if (["CLOSED", "DECEASED"].includes(coordinator.member.status))
      throw new Error("Membership access is closed");
    if (!coordinator.isSuspended && coordinator.status === "ACTIVE")
      throw new Error("Coordinator is already active");
    const now = new Date();
    await tx.coordinator.update({
      where: { id: coordinator.id },
      data: { isSuspended: false, status: "ACTIVE", suspendedAt: null },
    });
    const role = await tx.role.findUniqueOrThrow({ where: { code: "COORDINATOR" } });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: coordinator.member.userId, roleId: role.id } },
      create: { userId: coordinator.member.userId, roleId: role.id },
      update: { active: true, assignedAt: now },
    });
    await tx.coordinatorLifecycleEvent.create({
      data: {
        coordinatorId: coordinator.id,
        action: "RESTORED",
        reason: parsed.reason,
        actorId: parsed.actorId,
      },
    });
    let returnedMemberCount = 0;
    if (parsed.returnTemporarilyManagedMembers) {
      const temporarilyManaged = await tx.coordinatorTransfer.findMany({
        where: { fromCoordinatorId: coordinator.id, toCoordinatorId: null },
        orderBy: { effectiveAt: "desc" },
        select: {
          memberId: true,
          member: { select: { coordinatorId: true, userId: true, externalId: true } },
        },
      });
      const seen = new Set<string>();
      for (const transfer of temporarilyManaged) {
        if (seen.has(transfer.memberId) || transfer.member.coordinatorId !== null) continue;
        seen.add(transfer.memberId);
        // Only the latest assignment may authorize returning this member.
        // An older suspension must not override a later Admin assignment.
        const latestTransfer = await tx.coordinatorTransfer.findFirst({
          where: { memberId: transfer.memberId },
          orderBy: { effectiveAt: "desc" },
          select: { fromCoordinatorId: true, toCoordinatorId: true },
        });
        if (
          latestTransfer?.fromCoordinatorId !== coordinator.id ||
          latestTransfer.toCoordinatorId !== null
        )
          continue;
        await tx.member.update({
          where: { id: transfer.memberId },
          data: { coordinatorId: coordinator.id },
        });
        await tx.coordinatorTransfer.create({
          data: {
            memberId: transfer.memberId,
            fromCoordinatorId: null,
            toCoordinatorId: coordinator.id,
            reason: parsed.reason,
            actorId: parsed.actorId,
            effectiveAt: now,
          },
        });
        await createInAppNotificationInTransaction(tx, {
          userId: transfer.member.userId,
          type: "COORDINATOR_RETURN",
          title: "Your Coordinator has returned",
          body: "The Foundation restored your previous Coordinator assignment.",
          template: "COORDINATOR_RETURN",
          relatedExternalId: transfer.member.externalId,
          idempotencyKey: `coordinator-return:${coordinator.id}:${now.toISOString()}:member:${transfer.memberId}`,
        });
        returnedMemberCount += 1;
      }
    }
    await createInAppNotificationInTransaction(tx, {
      userId: coordinator.member.userId,
      type: "COORDINATOR_RESTORED",
      title: "Coordinator access restored",
      body: "The Foundation restored your Coordinator permissions.",
      template: "COORDINATOR_RESTORED",
      relatedExternalId: coordinator.externalId,
      idempotencyKey: `coordinator-restored:${coordinator.id}:${now.toISOString()}`,
    });
    await tx.auditLog.create({
      data: {
        actorId: parsed.actorId,
        action: "COORDINATOR_RESTORED",
        entityType: "Coordinator",
        entityId: coordinator.id,
        reason: parsed.reason,
        afterState: { returnedMemberCount },
      },
    });
    return {
      coordinatorExternalId: coordinator.externalId,
      status: "ACTIVE" as const,
      returnedMemberCount,
    };
  });
}

export async function changeMemberCoordinator(input: {
  actorId: string;
  memberExternalId: string;
  replacementCoordinatorExternalId: string;
  reason: string;
}) {
  const parsed = z
    .object({
      actorId: uuid,
      memberExternalId: uuid,
      replacementCoordinatorExternalId: uuid,
      reason,
    })
    .parse(input);
  return runSerializablePaymentTransaction(async (tx) => {
    const member = await tx.member.findUnique({
      where: { externalId: parsed.memberExternalId },
      select: { id: true, externalId: true, userId: true, coordinatorId: true },
    });
    if (!member) throw new Error("Member not found");
    const replacement = await getActiveReplacement(
      tx,
      parsed.replacementCoordinatorExternalId,
      member.coordinatorId ?? "00000000-0000-0000-0000-000000000000",
    );
    if (member.coordinatorId === replacement.id)
      throw new Error("Member already has this Coordinator");
    const previous = member.coordinatorId
      ? await tx.coordinator.findUnique({
          where: { id: member.coordinatorId },
          select: { member: { select: { fullName: true, userId: true } } },
        })
      : null;
    await tx.member.update({ where: { id: member.id }, data: { coordinatorId: replacement.id } });
    const transfer = await tx.coordinatorTransfer.create({
      data: {
        memberId: member.id,
        fromCoordinatorId: member.coordinatorId,
        toCoordinatorId: replacement.id,
        reason: parsed.reason,
        actorId: parsed.actorId,
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: member.userId,
      type: member.coordinatorId ? "COORDINATOR_CHANGED" : "COORDINATOR_ASSIGNED",
      title: member.coordinatorId ? "Your Coordinator assignment changed" : "Coordinator assigned",
      body: `Coordinator changed from ${previous?.member.fullName ?? "Foundation Admin"} to ${replacement.member.fullName}, effective ${transfer.effectiveAt.toISOString()}.`,
      template: member.coordinatorId ? "COORDINATOR_CHANGED" : "COORDINATOR_ASSIGNED",
      relatedExternalId: member.externalId,
      idempotencyKey: `coordinator-change:${transfer.id}`,
    });
    for (const recipient of [previous?.member.userId, replacement.member.userId].filter(
      (id): id is string => Boolean(id),
    )) {
      await createInAppNotificationInTransaction(tx, {
        userId: recipient,
        type: "COORDINATOR_CHANGED",
        title: "Member assignment updated",
        body: `Member ${member.externalId} changed Coordinator assignment effective ${transfer.effectiveAt.toISOString()}.`,
        relatedExternalId: member.externalId,
        idempotencyKey: `coordinator-assignment:${transfer.id}:${recipient}`,
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: parsed.actorId,
        action: member.coordinatorId ? "MEMBER_COORDINATOR_CHANGED" : "MEMBER_COORDINATOR_ASSIGNED",
        entityType: "Member",
        entityId: member.id,
        reason: parsed.reason,
        beforeState: { coordinatorId: member.coordinatorId },
        afterState: { coordinatorExternalId: replacement.externalId },
      },
    });
    return { memberExternalId: member.externalId, coordinatorExternalId: replacement.externalId };
  });
}
