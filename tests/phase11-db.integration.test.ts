import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/server/database/prisma";
import {
  createCoordinatorProfile,
  changeUserRole,
} from "../src/server/admin/admin-command-service";
import {
  adminMemberDetail,
  searchAdminMembers,
  searchAdminUsers,
} from "../src/server/admin/admin-query-service";
import {
  listMemberNominees,
  submitNominee,
  uploadNomineeEvidence,
  readNomineeBankForVerification,
  verifyNominee,
  downloadNomineeEvidence,
} from "../src/server/members/nominee-persistence-service";
import {
  changeMemberCoordinator,
  suspendCoordinatorAndReassign,
  restoreCoordinator,
} from "../src/server/coordinators/coordinator-management-service";
import { persistSession, signAccessToken } from "../src/server/auth/session";
import { requirePermissionForAccessToken } from "../src/server/http/authorize";
import { searchAuditLog } from "../src/server/audit/audit-query-service";

const run = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const userIds: string[] = [];
const memberIds: string[] = [];
const coordinatorIds: string[] = [];
const evidence = () =>
  new File(["%PDF-1.4\nSynthetic nominee evidence\n%%EOF"], "nominee.pdf", {
    type: "application/pdf",
  });
(run ? describe : describe.skip)("Phase 11 Admin and nominee persistence", () => {
  it("protects bank records, retains verified nominees until replacement approval and applies immediate permission revocation", async () => {
    vi.stubEnv("BANK_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
    const marker = crypto.randomUUID();
    const users = [];
    for (const kind of ["admin", "member", "coordinator"]) {
      const user = await prisma.user.create({
        data: { email: `phase11-${kind}-${marker}@example.invalid` },
      });
      users.push(user);
      userIds.push(user.id);
    }
    const [admin, owner, other] = users;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
    const members = [];
    for (const user of [owner, other]) {
      const member = await prisma.member.create({
        data: { userId: user.id, fullName: `Phase11-${marker}`, address: "Synthetic test only" },
      });
      members.push(member);
      memberIds.push(member.id);
    }
    const coordinator = await createCoordinatorProfile(admin.id, {
      memberExternalId: members[1].externalId,
      referralCode: `P11${marker.replaceAll("-", "").slice(0, 10)}`,
      reason: "Synthetic Coordinator appointment",
    });
    coordinatorIds.push(
      (
        await prisma.coordinator.findUniqueOrThrow({
          where: { externalId: coordinator.externalId },
        })
      ).id,
    );
    await changeMemberCoordinator({
      actorId: admin.id,
      memberExternalId: members[0].externalId,
      replacementCoordinatorExternalId: coordinator.externalId,
      reason: "Synthetic assignment",
    });
    const token = await signAccessToken(other.id, ["admin:*"]);
    await persistSession(token, other.id);
    expect(
      (await requirePermissionForAccessToken(token, "coordinator:members:manage")).userId,
    ).toBe(other.id);
    await expect(requirePermissionForAccessToken(token, "admin:*")).rejects.toThrow("Forbidden");
    const command = {
      kind: "PRIMARY",
      fullName: "Synthetic Primary",
      relationship: "Spouse",
      contactDetails: {},
      bankDetails: {
        accountHolderName: "Synthetic Primary",
        accountNumber: "123456789012",
        ifsc: "ABCD0123456",
      },
    };
    const primary = await submitNominee(owner.id, command);
    expect(primary.status).toBe("PENDING_VERIFICATION");
    expect(primary.isCurrent).toBe(false);
    const stored = await prisma.nominee.findUniqueOrThrow({
      where: { externalId: primary.externalId },
    });
    expect(JSON.stringify(stored.bankEncrypted)).not.toContain(command.bankDetails.accountNumber);
    await expect(
      readNomineeBankForVerification(owner.id, primary.externalId, false, "Unauthorized review"),
    ).rejects.toThrow("not found");
    await expect(
      verifyNominee(admin.id, primary.externalId, true, {
        approved: true,
        reason: "Missing review",
      }),
    ).rejects.toThrow("bank review");
    const document = await uploadNomineeEvidence(owner.id, primary.externalId, evidence());
    await expect(
      downloadNomineeEvidence(other.id, primary.externalId, document.externalId, "MEMBER"),
    ).rejects.toThrow("not found");
    expect(
      (
        await readNomineeBankForVerification(
          admin.id,
          primary.externalId,
          true,
          "Synthetic bank verification",
        )
      ).ifsc,
    ).toBe(command.bankDetails.ifsc);
    await verifyNominee(admin.id, primary.externalId, true, {
      approved: true,
      reason: "Synthetic evidence checked",
    });
    const replacement = await submitNominee(owner.id, {
      ...command,
      fullName: "Synthetic Replacement",
      replacesNomineeExternalId: primary.externalId,
    });
    expect(
      (await listMemberNominees(owner.id)).find(
        (nominee) => nominee.externalId === primary.externalId,
      )?.isCurrent,
    ).toBe(true);
    await uploadNomineeEvidence(owner.id, replacement.externalId, evidence());
    await readNomineeBankForVerification(
      admin.id,
      replacement.externalId,
      true,
      "Synthetic replacement bank review",
    );
    await verifyNominee(admin.id, replacement.externalId, true, {
      approved: true,
      reason: "Synthetic replacement approved",
    });
    const current = await listMemberNominees(owner.id);
    expect(
      current.filter((nominee) => nominee.kind === "PRIMARY" && nominee.isCurrent),
    ).toHaveLength(1);
    expect(current.find((nominee) => nominee.externalId === primary.externalId)?.status).toBe(
      "INACTIVE",
    );
    expect(JSON.stringify(current)).not.toContain(command.bankDetails.accountNumber);
    const profile = await adminMemberDetail(members[0].externalId, admin.id);
    const accounts = await searchAdminUsers({ search: marker });
    expect(accounts.users.find((user) => user.externalId === admin.externalId)?.member).toBeNull();
    expect(
      accounts.users
        .find((user) => user.externalId === admin.externalId)
        ?.roles.some((row) => row.role.code === "ADMIN" && row.active),
    ).toBe(true);
    expect(JSON.stringify(accounts)).not.toMatch(
      /passwordHash|pendingEmail|pendingMobile|bankEncrypted/,
    );
    expect(
      profile.transfers.some((row) => row.toCoordinator?.externalId === coordinator.externalId),
    ).toBe(true);
    expect(JSON.stringify(profile)).not.toContain(command.bankDetails.accountNumber);
    expect(profile.nominees).toHaveLength(2);
    expect(
      profile.nominees
        .flatMap((nominee) => nominee.documents)
        .every((document) => Boolean(document.externalId) && Boolean(document.originalFilename)),
    ).toBe(true);
    expect(JSON.stringify(profile.nominees)).not.toMatch(/evidenceBytes|storageKey|bankEncrypted/);
    expect(
      (await searchAdminMembers({ search: marker })).members.map((member) => member.externalId),
    ).toContain(members[0].externalId);
    await changeUserRole(admin.id, other.externalId, {
      roleCode: "COORDINATOR",
      active: false,
      reason: "Synthetic revoke",
    });
    await expect(
      requirePermissionForAccessToken(token, "coordinator:members:manage"),
    ).rejects.toThrow("suspended");
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: memberIds[0] } })).coordinatorId,
    ).toBeNull();
    await restoreCoordinator({
      actorId: admin.id,
      coordinatorExternalId: coordinator.externalId,
      returnTemporarilyManagedMembers: true,
      reason: "Synthetic audited restoration after role revocation",
    });
    await changeUserRole(admin.id, other.externalId, {
      roleCode: "COORDINATOR",
      active: true,
      reason: "Synthetic restore",
    });
    await suspendCoordinatorAndReassign({
      actorId: admin.id,
      coordinatorExternalId: coordinator.externalId,
      mode: "FOUNDATION_ADMIN",
      reason: "Synthetic suspension",
    });
    await expect(
      requirePermissionForAccessToken(token, "coordinator:members:manage"),
    ).rejects.toThrow("suspended");
    await expect(
      changeUserRole(admin.id, other.externalId, {
        roleCode: "COORDINATOR",
        active: true,
        reason: "Attempt suspended grant",
      }),
    ).rejects.toThrow("active Coordinator");
    await expect(
      changeUserRole(admin.id, admin.externalId, {
        roleCode: "ADMIN",
        active: false,
        reason: "Self revoke",
      }),
    ).rejects.toThrow("another Admin");
    const audit = await searchAuditLog({ actorExternalId: admin.externalId, action: "NOMINEE" });
    expect(audit.total).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain(command.bankDetails.accountNumber);
  }, 240_000);
});
afterAll(async () => {
  if (!run || !userIds.length) return;
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.nomineeVerification.deleteMany({
    where: { nominee: { memberId: { in: memberIds } } },
  });
  await prisma.nomineeDocument.deleteMany({ where: { nominee: { memberId: { in: memberIds } } } });
  await prisma.nominee.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.coordinatorTransfer.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.coordinatorLifecycleEvent.deleteMany({
    where: { coordinatorId: { in: coordinatorIds } },
  });
  await prisma.member.updateMany({
    where: { id: { in: memberIds } },
    data: { coordinatorId: null },
  });
  await prisma.coordinator.deleteMany({ where: { id: { in: coordinatorIds } } });
  await prisma.communitySupportPlan.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  vi.unstubAllEnvs();
}, 90_000);
