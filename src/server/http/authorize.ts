import { NextRequest } from "next/server";
import { assertSessionActive, verifyAccessToken } from "../auth/session";
import { requirePermission } from "../auth/authorization";
import { prisma } from "../database/prisma";
import {
  MembershipPaymentRequiredError,
  needsInitialMembershipPayment,
  onboardingMemberSelect,
  onboardingPathAllowed,
} from "../members/paid-onboarding";

export async function requirePermissionForAccessToken(
  token: string,
  permission: string,
  allowOnboarding = false,
) {
  const principal = await readActiveAccessPrincipal(token);
  if (
    principal.memberUnavailable &&
    !principal.permissions.has("admin:*") &&
    permission !== "member:cash:remit"
  )
    throw new Error("Membership access is closed; contact Foundation Admin");
  requirePermission(principal, permission);
  if (
    principal.onboardingPaymentRequired &&
    !principal.permissions.has("admin:*") &&
    !allowOnboarding
  )
    throw new MembershipPaymentRequiredError();
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
          ...onboardingMemberSelect,
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
    onboardingPaymentRequired: needsInitialMembershipPayment(user.member),
    registrationDueId: user.member?.registrationDueId ?? null,
    registrationDueExternalId: user.member?.registrationDue?.externalId ?? null,
  };
}

export async function requireApiPermission(request: NextRequest, permission: string) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.cookies.get("access_token")?.value;
  if (!token) throw new Error("Unauthenticated");
  const allowed = onboardingPathAllowed(request.nextUrl.pathname, request.method);
  const principal = await requirePermissionForAccessToken(token, permission, allowed);
  if (principal.onboardingPaymentRequired && !principal.permissions.has("admin:*")) {
    const match = /^\/api\/member\/payments\/([0-9a-f-]{36})\/(resume|cancel)$/i.exec(
      request.nextUrl.pathname,
    );
    if (match) {
      const payment = await prisma.payment.findFirst({
        where: {
          externalId: match[1],
          member: { userId: principal.userId },
          dueId: principal.registrationDueId,
        },
        select: { id: true },
      });
      if (!payment) throw new MembershipPaymentRequiredError();
    }
  }
  return principal;
}
