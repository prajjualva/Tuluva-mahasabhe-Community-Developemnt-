import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/prisma";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";

const reason = z.string().trim().min(3).max(1000);
const requestSchema = z
  .object({ dueExternalId: z.string().uuid(), reason, idempotencyKey: z.string().min(16).max(200) })
  .strict();
const decisionSchema = z.object({ approved: z.boolean(), reason }).strict();
const safeSelect = {
  externalId: true,
  status: true,
  reason: true,
  decisionReason: true,
  createdAt: true,
  decidedAt: true,
  due: {
    select: {
      externalId: true,
      purpose: true,
      amountPaise: true,
      status: true,
      member: { select: { externalId: true, fullName: true } },
    },
  },
} satisfies Prisma.DueWaiverRequestSelect;

async function assertRequester(
  tx: Prisma.TransactionClient,
  actorId: string,
  dueExternalId: string,
) {
  const due = await tx.due.findFirst({
    where: {
      externalId: dueExternalId,
      member: {
        coordinator: { member: { userId: actorId }, status: "ACTIVE", isSuspended: false },
      },
    },
    include: { member: { select: { userId: true } } },
  });
  if (!due) throw new Error("Due not found");
  return due;
}
export async function requestDueWaiver(actorId: string, input: unknown) {
  const command = requestSchema.parse(input);
  return runSerializablePaymentTransaction(async (tx) => {
    const due = await assertRequester(tx, actorId, command.dueExternalId);
    const replay = await tx.dueWaiverRequest.findUnique({
      where: { idempotencyKey: command.idempotencyKey },
    });
    if (replay) {
      if (
        replay.dueId !== due.id ||
        replay.requestedById !== actorId ||
        replay.reason !== command.reason
      )
        throw new Error("Idempotency key is already in use");
      return tx.dueWaiverRequest.findUniqueOrThrow({
        where: { externalId: replay.externalId },
        select: safeSelect,
      });
    }
    if (!["PENDING", "OVERDUE", "EXPIRED"].includes(due.status))
      throw new Error("Only unpaid dues can be waived");
    if (await tx.payment.count({ where: { dueId: due.id, status: "PENDING" } }))
      throw new Error("Resolve pending payment before requesting a waiver");
    if (await tx.dueWaiverRequest.count({ where: { dueId: due.id, status: "PENDING" } }))
      throw new Error("A waiver request is already pending");
    const request = await tx.dueWaiverRequest.create({
      data: {
        dueId: due.id,
        requestedById: actorId,
        reason: command.reason,
        idempotencyKey: command.idempotencyKey,
      },
      select: safeSelect,
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "DUE_WAIVER_REQUESTED",
        entityType: "DueWaiverRequest",
        entityId: request.externalId,
        reason: command.reason,
        afterState: { dueExternalId: due.externalId },
      },
    });
    return request;
  });
}
export async function listDueWaivers(actorId: string, admin: boolean) {
  return prisma.dueWaiverRequest.findMany({
    where: admin
      ? {}
      : {
          due: {
            member: {
              coordinator: { member: { userId: actorId }, status: "ACTIVE", isSuspended: false },
            },
          },
        },
    select: safeSelect,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
}
export async function decideDueWaiver(actorId: string, externalId: string, input: unknown) {
  z.string().uuid().parse(externalId);
  const command = decisionSchema.parse(input);
  return runSerializablePaymentTransaction(async (tx) => {
    if (
      !(await tx.userRole.count({
        where: {
          userId: actorId,
          active: true,
          role: { code: "ADMIN" },
          user: { status: "ACTIVE" },
        },
      }))
    )
      throw new Error("Forbidden");
    const request = await tx.dueWaiverRequest.findUniqueOrThrow({
      where: { externalId },
      include: { due: { include: { member: { select: { userId: true } } } } },
    });
    const status = command.approved ? "APPROVED" : "REJECTED";
    if (request.status !== "PENDING") {
      if (
        request.status !== status ||
        request.decidedById !== actorId ||
        request.decisionReason !== command.reason
      )
        throw new Error("Waiver decision is immutable");
      return tx.dueWaiverRequest.findUniqueOrThrow({ where: { externalId }, select: safeSelect });
    }
    if (command.approved) {
      if (await tx.payment.count({ where: { dueId: request.dueId, status: "PENDING" } }))
        throw new Error("Resolve pending payment before approving a waiver");
      const changed = await tx.due.updateMany({
        where: { id: request.dueId, status: { in: ["PENDING", "OVERDUE", "EXPIRED"] } },
        data: { status: "WAIVED" },
      });
      if (changed.count !== 1) throw new Error("Only unpaid dues can be waived");
      // A waiver does not constitute a paid ₹369 fee, plan activation, or reactivation.
    }
    const updated = await tx.dueWaiverRequest.update({
      where: { externalId },
      data: { status, decidedById: actorId, decidedAt: new Date(), decisionReason: command.reason },
      select: safeSelect,
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: `DUE_WAIVER_${status}`,
        entityType: "DueWaiverRequest",
        entityId: externalId,
        reason: command.reason,
        beforeState: { dueStatus: request.due.status },
        afterState: { status, dueExternalId: request.due.externalId },
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: request.due.member.userId,
      type: "SYSTEM",
      title: `Due waiver ${status.toLowerCase()}`,
      body: command.approved
        ? "Foundation Admin approved a due waiver. It does not automatically reactivate membership or activate a plan."
        : "Foundation Admin did not approve the requested due waiver. Review outstanding dues in your member portal.",
      relatedExternalId: request.due.externalId,
      idempotencyKey: `due-waiver:${externalId}:${status}`,
    });
    return updated;
  });
}
