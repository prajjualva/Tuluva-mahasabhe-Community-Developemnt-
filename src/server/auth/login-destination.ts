import { prisma } from "../database/prisma";
import { needsInitialMembershipPayment, onboardingMemberSelect } from "../members/paid-onboarding";

/** A live destination shared by password and OTP sign-in. */
export async function loginDestination(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      roles: { where: { active: true }, select: { role: { select: { code: true } } } },
      member: {
        select: {
          ...onboardingMemberSelect,
          status: true,
          coordinatorProfile: { select: { status: true, isSuspended: true } },
        },
      },
    },
  });
  if (user.roles.some((row) => row.role.code === "ADMIN")) return "/admin";
  if (user.roles.some((row) => row.role.code === "PAYMENT_REVIEWER")) return "/payment-review";
  if (user.member && ["CLOSED", "DECEASED"].includes(user.member.status))
    return "/account-unavailable";
  if (needsInitialMembershipPayment(user.member)) return "/membership-payment";
  if (
    user.roles.some((row) => row.role.code === "COORDINATOR") &&
    user.member?.coordinatorProfile?.status === "ACTIVE" &&
    !user.member.coordinatorProfile.isSuspended
  )
    return "/coordinator";
  return "/member";
}
