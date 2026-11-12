import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import { issueInitialAdminAccess } from "../src/server/auth/initial-admin-access";
import { hashPassword, verifyPassword } from "../src/server/auth/password";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const restoredAssignments: { userId: string; roleId: string }[] = [];
let targetId = "";
(enabled ? describe : describe.skip)("persistent initial Admin access handoff", () => {
  it("issues one audited password, supersedes pending codes, refuses reuse and never changes a signed-in owner", async () => {
    const activeAdmins = await prisma.userRole.findMany({
      where: { active: true, role: { code: "ADMIN" } },
      select: { userId: true, roleId: true },
    });
    restoredAssignments.push(...activeAdmins);
    await prisma.userRole.updateMany({
      where: { active: true, role: { code: "ADMIN" } },
      data: { active: false },
    });
    const email = `initial-access-${randomUUID()}@example.invalid`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword("SyntheticOriginalAccess123!"),
        roles: { create: { role: { connect: { code: "ADMIN" } } } },
      },
    });
    targetId = user.id;
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: "SYSTEM_BOOTSTRAP",
        action: "INITIAL_ADMIN_BOOTSTRAPPED",
        entityType: "User",
        entityId: user.id,
        reason: "Isolated initial Admin fixture only",
      },
    });
    await prisma.otpChallenge.create({
      data: {
        userId: user.id,
        destination: email,
        purpose: "PASSWORD_RESET",
        codeHash: "00".repeat(32),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const command = {
      email,
      password: "SyntheticTemporaryAccess456!",
      reason: "Owner approved isolated initial access test",
    };
    await issueInitialAdminAccess(prisma, command);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(updated.passwordHash!, command.password)).toBe(true);
    expect(await verifyPassword(updated.passwordHash!, "SyntheticOriginalAccess123!")).toBe(false);
    expect(await prisma.otpChallenge.count({ where: { userId: user.id, consumedAt: null } })).toBe(
      0,
    );
    const events = await prisma.auditLog.findMany({
      where: { actorId: user.id, action: "INITIAL_ADMIN_TEMPORARY_PASSWORD_ISSUED" },
    });
    expect(events.length).toBe(1);
    expect(JSON.stringify(events).includes(command.password)).toBe(false);
    expect(JSON.stringify(events).includes(updated.passwordHash!)).toBe(false);
    await expect(issueInitialAdminAccess(prisma, command)).rejects.toThrow(
      "verified password reset",
    );
    expect(
      await prisma.auditLog.count({
        where: { actorId: user.id, action: "INITIAL_ADMIN_TEMPORARY_PASSWORD_ISSUED" },
      }),
    ).toBe(1);
    await prisma.userRole.updateMany({ where: { userId: user.id }, data: { active: false } });
    const signedInOwner = await prisma.user.create({
      data: {
        email: `used-access-${randomUUID()}@example.invalid`,
        passwordHash: await hashPassword("SyntheticSignedInOwner123!"),
        roles: { create: { role: { connect: { code: "ADMIN" } } } },
      },
    });
    targetId = signedInOwner.id;
    await prisma.auditLog.create({
      data: {
        actorId: signedInOwner.id,
        actorRole: "SYSTEM_BOOTSTRAP",
        action: "INITIAL_ADMIN_BOOTSTRAPPED",
        entityType: "User",
        entityId: signedInOwner.id,
        reason: "Isolated signed-in owner fixture",
      },
    });
    await prisma.authSession.create({
      data: {
        userId: signedInOwner.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await expect(
      issueInitialAdminAccess(prisma, { ...command, email: signedInOwner.email }),
    ).rejects.toThrow("verified password reset");
    const preserved = await prisma.user.findUniqueOrThrow({ where: { id: signedInOwner.id } });
    expect(preserved.passwordHash === signedInOwner.passwordHash).toBe(true);
  }, 180000);
});
afterAll(async () => {
  if (!enabled) return;
  // Only isolated disposable fixtures are touched. Restore the seeded identity
  // assignments for any other files run against this same test database.
  if (targetId)
    await prisma.userRole.updateMany({ where: { userId: targetId }, data: { active: false } });
  for (const assignment of restoredAssignments)
    await prisma.userRole.updateMany({ where: assignment, data: { active: true } });
  await prisma.$disconnect();
}, 60000);
