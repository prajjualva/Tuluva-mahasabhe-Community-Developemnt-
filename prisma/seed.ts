import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/server/auth/password";
import { PERMISSIONS } from "../src/server/auth/authorization";
import { SCHEME_DEFAULTS } from "../src/domain/scheme-settings";
const prisma = new PrismaClient();
async function main() {
  const passwordHash = await hashPassword("DevelopmentOnly-ChangeMe1!");
  const permissionRows = await Promise.all(
    PERMISSIONS.map((code) =>
      prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, description: code },
      }),
    ),
  );
  const adminRole = await prisma.role.upsert({
    where: { code: "ADMIN" },
    update: {},
    create: { code: "ADMIN", name: "Administrator" },
  });
  const memberRole = await prisma.role.upsert({
    where: { code: "MEMBER" },
    update: {},
    create: { code: "MEMBER", name: "Member" },
  });
  const coordinatorRole = await prisma.role.upsert({
    where: { code: "COORDINATOR" },
    update: {},
    create: { code: "COORDINATOR", name: "Coordinator" },
  });
  await prisma.rolePermission.createMany({
    data: permissionRows.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  const admin = await prisma.user.upsert({
    where: { email: "admin@dev.local" },
    update: {},
    create: { email: "admin@dev.local", mobile: "+919000000001", passwordHash },
  });
  await prisma.userRole.createMany({
    data: [{ userId: admin.id, roleId: adminRole.id }],
    skipDuplicates: true,
  });
  const coordinatorUser = await prisma.user.upsert({
    where: { email: "coordinator@dev.local" },
    update: {},
    create: { email: "coordinator@dev.local", mobile: "+919000000002", passwordHash },
  });
  const coordinatorMember = await prisma.member.upsert({
    where: { userId: coordinatorUser.id },
    update: {},
    create: {
      userId: coordinatorUser.id,
      fullName: "Development Coordinator",
      address: "Mangaluru, Karnataka",
    },
  });
  await prisma.coordinator.upsert({
    where: { memberId: coordinatorMember.id },
    update: {},
    create: { memberId: coordinatorMember.id, referralCode: "TULUVA01" },
  });
  await prisma.userRole.createMany({
    data: [
      { userId: coordinatorUser.id, roleId: memberRole.id },
      { userId: coordinatorUser.id, roleId: coordinatorRole.id },
    ],
    skipDuplicates: true,
  });
  for (const [key, value] of Object.entries(SCHEME_DEFAULTS)) {
    const setting = await prisma.schemeSetting.upsert({
      where: { key },
      update: {},
      create: { key },
    });
    await prisma.schemeSettingVersion.upsert({
      where: {
        settingId_effectiveFrom: { settingId: setting.id, effectiveFrom: new Date("2026-01-01") },
      },
      update: { value },
      create: { settingId: setting.id, value, effectiveFrom: new Date("2026-01-01") },
    });
  }
  console.log("Development seed complete. Admin: admin@dev.local / DevelopmentOnly-ChangeMe1!");
  void memberRole;
  void coordinatorRole;
}
main().finally(() => prisma.$disconnect());
