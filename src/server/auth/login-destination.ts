import { prisma } from "../database/prisma";

/** A live destination shared by password and OTP sign-in. */
export async function loginDestination(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      roles: { where: { active: true }, select: { role: { select: { code: true } } } },
      member: {
        select: {
          status: true,
          coordinatorProfile: { select: { status: true, isSuspended: true } },
        },
      },
    },
  });
  if (user.roles.some((row) => row.role.code === "ADMIN")) return "/admin";
  if (user.member && ["CLOSED", "DECEASED"].includes(user.member.status))
    return "/account-unavailable";
  if (
    user.roles.some((row) => row.role.code === "COORDINATOR") &&
    user.member?.coordinatorProfile?.status === "ACTIVE" &&
    !user.member.coordinatorProfile.isSuspended
  )
    return "/coordinator";
  return "/member";
}
