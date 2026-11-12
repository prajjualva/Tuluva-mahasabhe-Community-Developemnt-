import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "./password";

const commandSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(16).max(128),
  reason: z.string().trim().min(10).max(1000),
});

/** Operator-only initial handoff, not an HTTP password recovery mechanism. */
export async function issueInitialAdminAccess(database: PrismaClient, input: unknown) {
  const command = commandSchema.parse(input);
  if (command.email.endsWith("@dev.local") || command.password === "DevelopmentOnly-ChangeMe1!")
    throw new Error("Development identities cannot receive production initial access");
  const passwordHash = await hashPassword(command.password);
  await database.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { email: command.email },
        select: { id: true, externalId: true, status: true },
      });
      if (!user || user.status !== "ACTIVE") throw new Error("Initial Admin is unavailable");
      const [admins, ownAdmin, bootstrap, priorIssue, usedSessions, verifiedChallenges] =
        await Promise.all([
          tx.userRole.count({ where: { active: true, role: { code: "ADMIN" } } }),
          tx.userRole.count({ where: { userId: user.id, active: true, role: { code: "ADMIN" } } }),
          tx.auditLog.count({
            where: {
              actorId: user.id,
              actorRole: "SYSTEM_BOOTSTRAP",
              action: "INITIAL_ADMIN_BOOTSTRAPPED",
            },
          }),
          tx.auditLog.count({
            where: { actorId: user.id, action: "INITIAL_ADMIN_TEMPORARY_PASSWORD_ISSUED" },
          }),
          tx.authSession.count({ where: { userId: user.id } }),
          tx.auditLog.count({ where: { actorId: user.id, action: "OTP_CHALLENGE_VERIFIED" } }),
        ]);
      if (
        admins !== 1 ||
        ownAdmin !== 1 ||
        bootstrap !== 1 ||
        priorIssue ||
        usedSessions ||
        verifiedChallenges
      )
        throw new Error(
          "Initial access is already used or unavailable; use verified password reset",
        );
      const now = new Date();
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.authSession.updateMany({
        where: { userId: user.id, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
      await tx.otpChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: "SYSTEM_BOOTSTRAP",
          action: "INITIAL_ADMIN_TEMPORARY_PASSWORD_ISSUED",
          entityType: "User",
          entityId: user.id,
          reason: command.reason,
          afterState: { userExternalId: user.externalId, initialAccessOnly: true },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 },
  );
}
