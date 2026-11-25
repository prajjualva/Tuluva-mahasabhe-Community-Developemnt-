import { prisma } from "../database/prisma";
import { needsInitialMembershipPayment, onboardingMemberSelect } from "./paid-onboarding";
import { isDuePayable } from "../payments/payment-integrity";
import { onlinePaymentAvailability } from "../payments/online-payment-service";

export async function readOwnOnboarding(userId: string) {
  const member = await prisma.member.findUniqueOrThrow({
    where: { userId },
    select: {
      id: true,
      fullName: true,
      ...onboardingMemberSelect,
      coordinatorProfile: { select: { id: true } },
      user: { select: { email: true, emailVerifiedAt: true } },
    },
  });
  const due = member.registrationDueId
    ? await prisma.due.findUniqueOrThrow({
        where: { id: member.registrationDueId },
        select: {
          externalId: true,
          amountPaise: true,
          purpose: true,
          status: true,
          dueAt: true,
          payments: {
            where: { status: "PENDING" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { externalId: true, providerOrderId: true, method: true },
          },
        },
      })
    : null;
  const wallet = await prisma.wallet.findUnique({
    where: { memberId: member.id },
    select: { balancePaise: true },
  });
  const pending = due?.payments[0];
  return {
    fullName: member.fullName,
    email: member.user.email,
    emailVerified: !!member.user.emailVerifiedAt,
    paymentRequired: needsInitialMembershipPayment(member),
    grantApproved: member.membershipGrants.length > 0,
    onlineAvailable: onlinePaymentAvailability().available,
    walletBalancePaise: wallet?.balancePaise ?? 0,
    due: due
      ? {
          externalId: due.externalId,
          amountPaise: due.amountPaise,
          payable: isDuePayable(due),
          status: due.status,
        }
      : null,
    pendingPayment: pending
      ? {
          externalId: pending.externalId,
          method: pending.method,
          canCancel: pending.method === "ONLINE" && !pending.providerOrderId,
        }
      : null,
  };
}
