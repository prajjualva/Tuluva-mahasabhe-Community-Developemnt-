import { prisma } from "../database/prisma";
export class RegistrationEmailVerificationRequiredError extends Error {
  constructor() {
    super("Verify your email before starting your membership payment");
  }
}
export async function assertRegistrationEmailVerified(userId: string) {
  const member = await prisma.member.findUniqueOrThrow({
    where: { userId },
    select: { registrationDueId: true, user: { select: { emailVerifiedAt: true } } },
  });
  if (member.registrationDueId && !member.user.emailVerifiedAt)
    throw new RegistrationEmailVerificationRequiredError();
}
