import { NextRequest } from "next/server";
import { assertSessionActive, verifyAccessToken } from "../auth/session";
import { requirePermission } from "../auth/authorization";
import { prisma } from "../database/prisma";

export async function requirePermissionForAccessToken(token: string, permission: string) {
  const principal = await readActiveAccessPrincipal(token);
  if (
    principal.memberUnavailable &&
    !principal.permissions.has("admin:*") &&
    permission !== "member:cash:remit"
  )
    throw new Error("Membership access is closed; contact Foundation Admin");
  requirePermission(principal, permission);
  return principal;
}

export async function readActiveAccessPrincipal(token: string) {
  const tokenPrincipal = await verifyAccessToken(token);
  await assertSessionActive(token, tokenPrincipal.userId);
  // Permissions are read from the database for every request so revoked roles and
  // coordinator suspension take effect immediately instead of waiting for JWT expiry.
  const user = await prisma.user.findUnique({
    where: { id: tokenPrincipal.userId },
    select: {
      status: true,
      roles: {
        where: { active: true },
        select: {
          role: { select: { permissions: { select: { permission: { select: { code: true } } } } } },
        },
      },
      member: {
        select: {
          status: true,
          coordinatorProfile: { select: { isSuspended: true, status: true } },
        },
      },
    },
  });
  if (!user || user.status !== "ACTIVE") throw new Error("Unauthenticated");
  const permissions = new Set(
    user.roles.flatMap((assignment) =>
      assignment.role.permissions.map((rolePermission) => rolePermission.permission.code),
    ),
  );
  const coordinator = user.member?.coordinatorProfile;
  return {
    userId: tokenPrincipal.userId,
    permissions,
    coordinatorSuspended: coordinator?.isSuspended || coordinator?.status === "SUSPENDED",
    coordinatorActive: coordinator?.status === "ACTIVE" && !coordinator.isSuspended,
    memberUnavailable: !!user.member && ["CLOSED", "DECEASED"].includes(user.member.status),
  };
}

export async function requireApiPermission(request: NextRequest, permission: string) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.cookies.get("access_token")?.value;
  if (!token) throw new Error("Unauthenticated");
  return requirePermissionForAccessToken(token, permission);
}
