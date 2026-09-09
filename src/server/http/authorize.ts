import { NextRequest } from "next/server";
import { assertSessionActive, verifyAccessToken } from "../auth/session";
import { requirePermission } from "../auth/authorization";
import { prisma } from "../database/prisma";
export async function requireApiPermission(request: NextRequest, permission: string) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.cookies.get("access_token")?.value;
  if (!token) throw new Error("Unauthenticated");
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
      member: { select: { coordinatorProfile: { select: { isSuspended: true, status: true } } } },
    },
  });
  if (!user || user.status !== "ACTIVE") throw new Error("Unauthenticated");
  const permissions = new Set(
    user.roles.flatMap((assignment) =>
      assignment.role.permissions.map((rolePermission) => rolePermission.permission.code),
    ),
  );
  const coordinator = user.member?.coordinatorProfile;
  const principal = {
    userId: tokenPrincipal.userId,
    permissions,
    coordinatorSuspended: coordinator?.isSuspended || coordinator?.status === "SUSPENDED",
  };
  requirePermission(principal, permission);
  return principal;
}
