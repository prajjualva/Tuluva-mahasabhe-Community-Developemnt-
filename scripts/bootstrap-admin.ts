import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../src/server/auth/password";
import { PERMISSIONS } from "../src/server/auth/authorization";
import { SCHEME_DEFAULTS } from "../src/domain/scheme-settings";

async function main() {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // Credentials are environment inputs, never command arguments or output.
  const config = z
    .object({
      BOOTSTRAP_ADMIN_EMAIL: z
        .string()
        .email()
        .transform((value) => value.toLowerCase()),
      BOOTSTRAP_ADMIN_PASSWORD: z.string().min(16).max(128),
      BOOTSTRAP_ADMIN_REASON: z.string().trim().min(10).max(1000),
    })
    .parse(process.env);
  if (
    config.BOOTSTRAP_ADMIN_EMAIL.endsWith("@dev.local") ||
    config.BOOTSTRAP_ADMIN_PASSWORD === "DevelopmentOnly-ChangeMe1!"
  )
    throw new Error("Development credentials cannot bootstrap an administrative account");
  const prisma = new PrismaClient();
  try {
    const passwordHash = await hashPassword(config.BOOTSTRAP_ADMIN_PASSWORD);
    await prisma.$transaction(
      async (tx) => {
        if (await tx.userRole.count({ where: { active: true, role: { code: "ADMIN" } } }))
          throw new Error(
            "An Admin already exists. Use authenticated Admin role management instead.",
          );
        if (await tx.user.count({ where: { email: config.BOOTSTRAP_ADMIN_EMAIL } }))
          throw new Error("Bootstrap cannot take over an existing identity");
        const permissions = await Promise.all(
          PERMISSIONS.map((code) =>
            tx.permission.upsert({
              where: { code },
              create: { code, description: code },
              update: {},
            }),
          ),
        );
        for (const code of ["ADMIN", "MEMBER", "COORDINATOR"]) {
          const role = await tx.role.upsert({
            where: { code },
            create: { code, name: code },
            update: {},
          });
          const allowed = permissions.filter(
            (permission) =>
              code === "ADMIN" ||
              permission.code.startsWith(code === "MEMBER" ? "member:" : "coordinator:"),
          );
          await tx.rolePermission.createMany({
            data: allowed.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
            skipDuplicates: true,
          });
        }
        for (const [key, value] of Object.entries(SCHEME_DEFAULTS)) {
          const setting = await tx.schemeSetting.upsert({
            where: { key },
            create: { key },
            update: {},
          });
          if (!(await tx.schemeSettingVersion.count({ where: { settingId: setting.id } })))
            await tx.schemeSettingVersion.create({
              data: { settingId: setting.id, value, effectiveFrom: new Date() },
            });
        }
        const role = await tx.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
        const user = await tx.user.create({
          data: { email: config.BOOTSTRAP_ADMIN_EMAIL, passwordHash },
        });
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: "SYSTEM_BOOTSTRAP",
            action: "INITIAL_ADMIN_BOOTSTRAPPED",
            entityType: "User",
            entityId: user.id,
            reason: config.BOOTSTRAP_ADMIN_REASON,
            afterState: { userExternalId: user.externalId },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 },
    );
    process.stdout.write(
      "Initial administrative identity created and audited. Remove bootstrap secrets from the environment.\n",
    );
  } catch {
    process.stderr.write(
      "Admin bootstrap failed. Check eligibility, configuration, and database availability. No credentials are logged.\n",
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch(() => {
  process.stderr.write("Bootstrap configuration is invalid. No identity was changed.\n");
  process.exitCode = 1;
});
