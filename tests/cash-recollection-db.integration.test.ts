import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import {
  collectCashForDue,
  verifyCashCollection,
} from "../src/server/coordinators/cash-payment-service";

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const databaseDescribe = runDatabaseTests ? describe : describe.skip;
const created = {
  coordinatorUserId: "",
  coordinatorMemberId: "",
  memberUserId: "",
  memberId: "",
  dueId: "",
};

databaseDescribe("cash recollection persistence", () => {
  it("retains a rejected collection and permits one fresh collection for the same due", async () => {
    const marker = crypto.randomUUID();
    const coordinatorUser = await prisma.user.create({
      data: { email: `cash-coordinator-${marker}@example.invalid` },
    });
    created.coordinatorUserId = coordinatorUser.id;
    const coordinatorMember = await prisma.member.create({
      data: {
        userId: coordinatorUser.id,
        fullName: "Cash Test Coordinator",
        address: "Test-only record",
      },
    });
    created.coordinatorMemberId = coordinatorMember.id;
    const coordinator = await prisma.coordinator.create({
      data: { memberId: coordinatorMember.id, referralCode: `cash-${marker.slice(0, 8)}` },
    });
    const memberUser = await prisma.user.create({
      data: { email: `cash-member-${marker}@example.invalid` },
    });
    created.memberUserId = memberUser.id;
    const member = await prisma.member.create({
      data: {
        userId: memberUser.id,
        coordinatorId: coordinator.id,
        fullName: "Cash Test Member",
        address: "Test-only record",
      },
    });
    created.memberId = member.id;
    const due = await prisma.due.create({
      data: {
        memberId: member.id,
        purpose: "MEMBERSHIP",
        amountPaise: 36_900,
        dueAt: new Date(Date.now() + 86_400_000),
      },
    });
    created.dueId = due.id;

    const first = await collectCashForDue({
      coordinatorUserId: coordinatorUser.id,
      memberExternalId: member.externalId,
      dueExternalId: due.externalId,
      idempotencyKey: `cash-first-${marker}`,
    });
    await expect(
      collectCashForDue({
        coordinatorUserId: coordinatorUser.id,
        memberExternalId: member.externalId,
        dueExternalId: due.externalId,
        idempotencyKey: `cash-duplicate-${marker}`,
      }),
    ).rejects.toThrow("already open or settled");

    const firstCollection = await prisma.cashCollection.findUniqueOrThrow({
      where: { paymentId: first.id },
      select: { externalId: true },
    });
    await verifyCashCollection(
      firstCollection.externalId,
      coordinatorUser.id,
      false,
      "Payment evidence rejected",
    );

    const replacement = await collectCashForDue({
      coordinatorUserId: coordinatorUser.id,
      memberExternalId: member.externalId,
      dueExternalId: due.externalId,
      idempotencyKey: `cash-retry-${marker}`,
    });
    expect(replacement.id).not.toBe(first.id);
    const collections = await prisma.cashCollection.findMany({
      where: { dueId: due.id },
      select: { status: true },
    });
    expect(collections).toHaveLength(2);
    expect(collections.map((collection) => collection.status).sort()).toEqual([
      "PENDING_ADMIN_VERIFICATION",
      "REJECTED",
    ]);
  }, 30_000);
});

afterAll(async () => {
  if (!runDatabaseTests || !created.coordinatorUserId) return;
  await prisma.$transaction(async (tx) => {
    if (created.dueId)
      await tx.auditLog.deleteMany({ where: { entityId: { in: [created.dueId] } } });
    await tx.auditLog.deleteMany({
      where: { actorId: { in: [created.coordinatorUserId, created.memberUserId] } },
    });
    if (created.dueId) await tx.cashCollection.deleteMany({ where: { dueId: created.dueId } });
    if (created.dueId) await tx.payment.deleteMany({ where: { dueId: created.dueId } });
    if (created.dueId) await tx.due.deleteMany({ where: { id: created.dueId } });
    if (created.memberId)
      await tx.member.update({ where: { id: created.memberId }, data: { coordinatorId: null } });
    if (created.coordinatorMemberId)
      await tx.coordinator.deleteMany({ where: { memberId: created.coordinatorMemberId } });
    if (created.memberId) await tx.member.deleteMany({ where: { id: created.memberId } });
    if (created.coordinatorMemberId)
      await tx.member.deleteMany({ where: { id: created.coordinatorMemberId } });
    if (created.memberUserId) await tx.user.deleteMany({ where: { id: created.memberUserId } });
    if (created.coordinatorUserId)
      await tx.user.deleteMany({ where: { id: created.coordinatorUserId } });
  });
});
