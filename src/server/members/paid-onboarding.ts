import type { Prisma } from "@prisma/client";

export class MembershipPaymentRequiredError extends Error {
  constructor() {
    super("Complete your initial membership payment to continue");
  }
}

export const onboardingMemberSelect = {
  membershipGrants: { select: { externalId: true }, take: 1 },
  registrationDueId: true,
  registrationDue: {
    select: {
      externalId: true,
      status: true,
      payments: {
        where: {
          status: "SUCCEEDED",
          OR: [{ refund: { is: null } }, { refund: { status: { not: "SUCCEEDED" } } }],
        },
        select: { id: true },
        take: 1,
      },
    },
  },
} satisfies Prisma.MemberSelect;

export function needsInitialMembershipPayment(
  member:
    | {
        registrationDueId?: string | null;
        registrationDue?: { status: string; payments: unknown[] } | null;
        coordinatorProfile?: unknown;
        membershipGrants?: unknown[];
      }
    | null
    | undefined,
) {
  // Existing members keep their lifecycle, including renewal grace and the
  // permanent Coordinator fee exemption. A waiver is not a paid membership.
  return (
    !!member?.registrationDueId &&
    !member.coordinatorProfile &&
    !member.membershipGrants?.length &&
    !(member.registrationDue?.status === "PAID" && member.registrationDue.payments.length > 0)
  );
}

export function onboardingPathAllowed(pathname: string, method: string) {
  if (["/api/auth/otp/request", "/api/auth/otp/verify", "/api/account/deletion"].includes(pathname))
    return true;
  if (pathname === "/api/member/onboarding" && method === "GET") return true;
  if (pathname === "/api/member/payments" && method === "POST") return true;
  if (
    /^\/api\/member\/payments\/[0-9a-f-]{36}\/(resume|cancel|verify)$/i.test(pathname) &&
    method === "POST"
  )
    return true;
  return false;
}
