import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../database/prisma";
import { assertDuePayable, runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { settlePaymentInTransaction } from "../payments/payment-service";
import { issueGrantedMembershipPackInTransaction } from "../members/membership-pack-service";
import { refreshMembershipFinancialStatus } from "../membership/membership-lifecycle-service";

const base = {
  memberExternalId: z.string().uuid(),
  reason: z.string().trim().min(8).max(1000),
  idempotencyKey: z.string().min(16).max(200),
};
export const adminMembershipAccessCommand = z.discriminatedUnion("action", [
  z
    .object({
      ...base,
      action: z.literal("RECORD_PAYMENT"),
      reference: z.string().trim().min(3).max(100),
      receivedAt: z.iso.datetime(),
      fundsReceived: z.literal(true),
    })
    .strict(),
  z.object({ ...base, action: z.literal("GRANT"), confirmFeeExemption: z.literal(true) }).strict(),
]);

export async function administerInitialMembership(actorId: string, raw: unknown) {
  const input = adminMembershipAccessCommand.parse(raw);
  const referenceHash =
    input.action === "RECORD_PAYMENT"
      ? createHash("sha256").update(input.reference.toUpperCase()).digest("hex")
      : null;
  return runSerializablePaymentTransaction(
    async (tx) => {
      const admin = await tx.user.findFirst({
        where: {
          id: actorId,
          status: "ACTIVE",
          roles: {
            some: {
              active: true,
              role: { permissions: { some: { permission: { code: "admin:*" } } } },
            },
          },
        },
        select: { id: true },
      });
      if (!admin) throw new Error("Forbidden");
      const member = await tx.member.findUniqueOrThrow({
        where: { externalId: input.memberExternalId },
        include: { user: { select: { status: true } } },
      });
      if (["CLOSED", "DECEASED"].includes(member.status) || member.user.status !== "ACTIVE")
        throw new Error("Member access cannot be changed in this state");
      if (input.action === "GRANT") {
        const replay = await tx.membershipGrant.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { pack: { select: { externalId: true } } },
        });
        if (replay) {
          if (replay.memberId !== member.id || replay.reason !== input.reason)
            throw new Error("Idempotency key is already in use");
          return {
            memberExternalId: member.externalId,
            status: "FEE_EXEMPT",
            packExternalId: replay.pack?.externalId,
          };
        }
      } else {
        const replay = await tx.payment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { receipt: true, due: { select: { paidAt: true } } },
        });
        if (replay) {
          const evidence = await tx.auditLog.findFirst({
            where: { entityId: replay.id, action: "ADMIN_MEMBERSHIP_PAYMENT_CONFIRMED" },
            select: { reason: true },
          });
          if (
            replay.memberId !== member.id ||
            replay.method !== "MANUAL" ||
            replay.providerReference !== `admin-membership:${referenceHash}` ||
            replay.due?.paidAt?.getTime() !== new Date(input.receivedAt).getTime() ||
            evidence?.reason !== input.reason
          )
            throw new Error("Idempotency key is already in use");
          return {
            memberExternalId: member.externalId,
            status: replay.status,
            receiptNumber: replay.receipt?.receiptNumber,
          };
        }
      }
      const due = member.registrationDueId
        ? await tx.due.findUniqueOrThrow({ where: { id: member.registrationDueId } })
        : await tx.due.findFirst({
            where: { memberId: member.id, purpose: "MEMBERSHIP" },
            orderBy: { createdAt: "asc" },
          });
      if (!due || due.memberId !== member.id || due.purpose !== "MEMBERSHIP")
        throw new Error("Initial membership due not found");
      assertDuePayable(due);
      if (await tx.payment.count({ where: { dueId: due.id, status: "PENDING" } }))
        throw new Error("Resolve the pending payment first");
      if (!member.registrationDueId)
        await tx.member.update({ where: { id: member.id }, data: { registrationDueId: due.id } });
      if (input.action === "GRANT") {
        const grant = await tx.membershipGrant.create({
          data: {
            memberId: member.id,
            approvedById: actorId,
            reason: input.reason,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await tx.due.update({ where: { id: due.id }, data: { status: "WAIVED" } });
        await refreshMembershipFinancialStatus(tx, member.id);
        const pack = await issueGrantedMembershipPackInTransaction(tx, grant.id);
        await tx.auditLog.create({
          data: {
            actorId,
            actorRole: "ADMIN",
            action: "ADMIN_INITIAL_MEMBERSHIP_GRANTED",
            entityType: "Member",
            entityId: member.id,
            reason: input.reason,
            beforeState: { dueStatus: due.status },
            afterState: {
              dueExternalId: due.externalId,
              waivedAmountPaise: due.amountPaise,
              grantExternalId: grant.externalId,
              approvedAt: grant.approvedAt.toISOString(),
              noMoneyCollected: true,
            },
          },
        });
        return {
          memberExternalId: member.externalId,
          status: "FEE_EXEMPT",
          packExternalId: pack.externalId,
        };
      }
      const receivedAt = new Date(input.receivedAt);
      if (receivedAt > new Date()) throw new Error("Received date cannot be in the future");
      const payment = await tx.payment.create({
        data: {
          memberId: member.id,
          dueId: due.id,
          amountPaise: due.amountPaise,
          method: "MANUAL",
          idempotencyKey: input.idempotencyKey,
        },
      });
      const settled = await settlePaymentInTransaction(
        tx,
        payment.id,
        actorId,
        `admin-membership:${referenceHash}`,
        receivedAt,
      );
      await tx.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          action: "ADMIN_MEMBERSHIP_PAYMENT_CONFIRMED",
          entityType: "Payment",
          entityId: payment.id,
          reason: input.reason,
          afterState: {
            memberExternalId: member.externalId,
            amountPaise: due.amountPaise,
            reference: input.reference,
            receivedAt: receivedAt.toISOString(),
          },
        },
      });
      return {
        memberExternalId: member.externalId,
        status: settled.payment.status,
        receiptNumber: settled.receipt?.receiptNumber,
      };
    },
    { timeoutMs: 60_000 },
  );
}

export async function listInitialMembershipQueue(search: string) {
  const candidates = await prisma.member.findMany({
    where: {
      status: { notIn: ["CLOSED", "DECEASED"] },
      user: { status: "ACTIVE" },
      membershipGrants: { none: {} },
      dues: { some: { purpose: "MEMBERSHIP", status: { in: ["PENDING", "OVERDUE", "EXPIRED"] } } },
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" as const } },
              ...(z.string().uuid().safeParse(search).success ? [{ externalId: search }] : []),
            ],
          }
        : {}),
    },
    select: {
      externalId: true,
      fullName: true,
      registrationDueId: true,
      dues: {
        where: { purpose: "MEMBERSHIP" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, amountPaise: true, status: true },
      },
    },
    take: 50,
    orderBy: { joinedAt: "desc" },
  });
  return candidates
    .filter(
      (member) =>
        member.dues[0] && ["PENDING", "OVERDUE", "EXPIRED"].includes(member.dues[0].status),
    )
    .map((member) => ({
      externalId: member.externalId,
      fullName: member.fullName,
      amountPaise: member.dues[0].amountPaise,
    }));
}
