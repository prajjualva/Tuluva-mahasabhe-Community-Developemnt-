import { z } from "zod";
import { prisma } from "../database/prisma";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";

const requestSelect = {
  externalId: true,
  status: true,
  requestedAt: true,
  memberMessage: true,
  reviewedAt: true,
} as const;

export function readOwnDeletionRequest(userId: string) {
  return prisma.accountDeletionRequest.findUnique({ where: { userId }, select: requestSelect });
}

export async function submitDeletionRequest(userId: string, input: unknown) {
  z.object({ confirm: z.literal(true) })
    .strict()
    .parse(input);
  return runSerializablePaymentTransaction(async (tx) => {
    const previous = await tx.accountDeletionRequest.findUnique({ where: { userId } });
    if (previous && previous.status !== "CANCELLED") {
      return tx.accountDeletionRequest.findUniqueOrThrow({
        where: { userId },
        select: requestSelect,
      });
    }
    const request = await tx.accountDeletionRequest.upsert({
      where: { userId },
      create: { userId },
      update: {
        status: "PENDING",
        requestedAt: new Date(),
        memberMessage: null,
        reviewedById: null,
        reviewedAt: null,
      },
      select: requestSelect,
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        entityType: "AccountDeletionRequest",
        entityId: request.externalId,
        action: "ACCOUNT_DELETION_REQUESTED",
      },
    });
    return request;
  });
}

export async function cancelDeletionRequest(userId: string) {
  return runSerializablePaymentTransaction(async (tx) => {
    const request = await tx.accountDeletionRequest.findUnique({ where: { userId } });
    if (!request || request.status === "CANCELLED") return null;
    const result = await tx.accountDeletionRequest.update({
      where: { externalId: request.externalId },
      data: { status: "CANCELLED" },
      select: requestSelect,
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        entityType: "AccountDeletionRequest",
        entityId: request.externalId,
        action: "ACCOUNT_DELETION_REQUEST_CANCELLED",
      },
    });
    return result;
  });
}

export async function listDeletionRequests(input: unknown) {
  const { page } = z
    .object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
    })
    .strict()
    .parse(input);
  return prisma.accountDeletionRequest.findMany({
    where: { status: { in: ["PENDING", "IN_REVIEW"] } },
    select: {
      ...requestSelect,
      user: {
        select: { externalId: true, email: true, member: { select: { fullName: true } } },
      },
    },
    orderBy: [{ requestedAt: "asc" }, { externalId: "asc" }],
    take: 20,
    skip: (page - 1) * 20,
  });
}

export async function reviewDeletionRequest(actorId: string, input: unknown) {
  const command = z
    .object({
      requestId: z.string().uuid(),
      memberMessage: z.string().trim().min(10).max(1000),
    })
    .strict()
    .parse(input);
  return runSerializablePaymentTransaction(async (tx) => {
    const request = await tx.accountDeletionRequest.findUniqueOrThrow({
      where: { externalId: command.requestId },
    });
    if (request.status === "CANCELLED") throw new Error("Request is cancelled");
    const result = await tx.accountDeletionRequest.update({
      where: { externalId: request.externalId },
      data: {
        status: "IN_REVIEW",
        reviewedById: actorId,
        reviewedAt: new Date(),
        memberMessage: command.memberMessage,
      },
      select: requestSelect,
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "ACCOUNT_DELETION_REVIEWED",
        entityType: "AccountDeletionRequest",
        entityId: request.externalId,
        afterState: { memberMessage: command.memberMessage },
      },
    });
    return result;
  });
}
