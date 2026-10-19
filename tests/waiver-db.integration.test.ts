import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import {
  requestDueWaiver,
  decideDueWaiver,
  listDueWaivers,
} from "../src/server/membership/due-waiver-service";

const run = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const users: string[] = [],
  members: string[] = [];
let coordinatorId = "";
(run ? describe : describe.skip)("persistent due waiver authorization", () => {
  it("requires assigned active Coordinator request and audited Admin approval, without reactivation", async () => {
    const marker = crypto.randomUUID();
    for (const kind of ["coordinator", "member", "admin", "outsider"]) {
      const user = await prisma.user.create({
        data: { email: `waiver-${kind}-${marker}@example.invalid` },
      });
      users.push(user.id);
    }
    for (const userId of users.slice(0, 2)) {
      const member = await prisma.member.create({
        data: {
          userId,
          fullName: "Synthetic waiver test",
          address: "Synthetic only",
          status: "INACTIVE",
        },
      });
      members.push(member.id);
    }
    const coordinator = await prisma.coordinator.create({
      data: { memberId: members[0], referralCode: `WV${marker.replaceAll("-", "").slice(0, 12)}` },
    });
    coordinatorId = coordinator.id;
    await prisma.member.update({ where: { id: members[1] }, data: { coordinatorId } });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    await prisma.userRole.create({ data: { userId: users[2], roleId: role.id } });
    const due = await prisma.due.create({
      data: {
        memberId: members[1],
        purpose: "CONTRIBUTION",
        amountPaise: 10000,
        status: "EXPIRED",
        dueAt: new Date(Date.now() - 86400000),
      },
    });
    const command = {
      dueExternalId: due.externalId,
      reason: "Synthetic hardship evidence reviewed",
      idempotencyKey: `waiver-test-${marker}`,
    };
    await expect(requestDueWaiver(users[3], command)).rejects.toThrow("not found");
    const request = await requestDueWaiver(users[0], command);
    expect((await requestDueWaiver(users[0], command)).externalId).toBe(request.externalId);
    expect((await prisma.due.findUniqueOrThrow({ where: { id: due.id } })).status).toBe("EXPIRED");
    await expect(
      decideDueWaiver(users[0], request.externalId, {
        approved: true,
        reason: "Cannot self approve",
      }),
    ).rejects.toThrow("Forbidden");
    const decision = { approved: true, reason: "Synthetic Admin final hardship decision" };
    expect((await decideDueWaiver(users[2], request.externalId, decision)).status).toBe("APPROVED");
    expect((await decideDueWaiver(users[2], request.externalId, decision)).status).toBe("APPROVED");
    await expect(
      decideDueWaiver(users[2], request.externalId, {
        approved: false,
        reason: "Attempted reversal",
      }),
    ).rejects.toThrow("immutable");
    expect((await prisma.due.findUniqueOrThrow({ where: { id: due.id } })).status).toBe("WAIVED");
    expect((await prisma.member.findUniqueOrThrow({ where: { id: members[1] } })).status).toBe(
      "INACTIVE",
    );
    expect(
      await prisma.auditLog.count({
        where: { action: "DUE_WAIVER_APPROVED", entityId: request.externalId },
      }),
    ).toBe(1);
    const otherDue = await prisma.due.create({
      data: {
        memberId: members[1],
        purpose: "MEMBERSHIP",
        amountPaise: 36900,
        dueAt: new Date(Date.now() + 86400000),
      },
    });
    await prisma.payment.create({
      data: {
        memberId: members[1],
        dueId: otherDue.id,
        amountPaise: 36900,
        method: "ONLINE",
        idempotencyKey: `waiver-pending-${marker}`,
      },
    });
    await expect(
      requestDueWaiver(users[0], {
        ...command,
        dueExternalId: otherDue.externalId,
        idempotencyKey: `waiver-blocked-${marker}`,
      }),
    ).rejects.toThrow("pending payment");
    await prisma.coordinator.update({
      where: { id: coordinatorId },
      data: { isSuspended: true, status: "SUSPENDED" },
    });
    expect(await listDueWaivers(users[0], false)).toEqual([]);
  }, 120000);
});
afterAll(async () => {
  if (!run || !users.length) return;
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.dueWaiverRequest.deleteMany({ where: { due: { memberId: { in: members } } } });
  await prisma.payment.deleteMany({ where: { memberId: { in: members } } });
  await prisma.due.deleteMany({ where: { memberId: { in: members } } });
  await prisma.member.updateMany({ where: { id: { in: members } }, data: { coordinatorId: null } });
  if (coordinatorId) await prisma.coordinator.delete({ where: { id: coordinatorId } });
  await prisma.member.deleteMany({ where: { id: { in: members } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}, 90000);
