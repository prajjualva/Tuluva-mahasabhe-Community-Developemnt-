import { addUtcCalendarMonths, membershipBillingCycle } from "../../domain/calendar";
import { prisma } from "../database/prisma";
import { effectiveSchemeNumber } from "../database/scheme-policy";
import { readOwnProfile } from "./profile-service";
import { canReadMemberIdCard, MembershipCardPaymentRequiredError } from "./member-card-access";

export function cardValidity(input: {
  status: string;
  feeExempt: boolean;
  restrictedByDues: boolean;
  annualSettled: boolean;
  paymentDeadline: Date | null;
  cycleEnd: Date;
  now: Date;
}) {
  const format = (value: Date) =>
    value.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  if (["INACTIVE", "CLOSED", "DECEASED"].includes(input.status) || input.restrictedByDues)
    return { label: "Membership validity", value: "Inactive" };
  if (input.status === "GRACE")
    return {
      label: "Membership validity",
      value: input.paymentDeadline
        ? "Grace period until " + format(input.paymentDeadline)
        : "Grace period",
    };
  if (input.feeExempt) return { label: "Membership validity", value: "Active · fee exempt" };
  if (input.annualSettled) return { label: "Valid until", value: format(input.cycleEnd) };
  if (input.paymentDeadline)
    return {
      label: "Membership validity",
      value:
        input.paymentDeadline > input.now
          ? "Payment due by " + format(input.paymentDeadline)
          : "Renewal payment overdue",
    };
  return { label: "Membership validity", value: "Renewal confirmation pending" };
}

export async function readOwnMemberCard(userId: string, now = new Date()) {
  if (!(await canReadMemberIdCard(userId))) throw new MembershipCardPaymentRequiredError();
  const profile = await readOwnProfile(userId);
  const details = await prisma.member.findUniqueOrThrow({
    where: { userId },
    select: {
      id: true,
      membershipBillingAnchor: true,
      coordinatorProfile: { select: { status: true, isSuspended: true } },
      user: {
        select: {
          roles: {
            where: { active: true, role: { code: "COORDINATOR" } },
            select: { active: true },
          },
        },
      },
    },
  });
  const anchor = details.membershipBillingAnchor ?? profile.joinedAt;
  const cycle = membershipBillingCycle(anchor, now);
  const cycleStart = addUtcCalendarMonths(anchor, cycle * 12);
  const cycleEnd = addUtcCalendarMonths(anchor, (cycle + 1) * 12);
  const [annualDue, overdueMembership, overdueContributions, threshold] = await Promise.all([
    prisma.due.findFirst({
      where: {
        memberId: details.id,
        purpose: "MEMBERSHIP",
        OR: [
          { billingCycleKey: `membership:${details.id}:${anchor.getTime()}:${cycle}` },
          { billingCycleKey: null, createdAt: { gte: cycleStart, lt: cycleEnd } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: { status: true, dueAt: true },
    }),
    prisma.due.count({
      where: {
        memberId: details.id,
        purpose: "MEMBERSHIP",
        status: { in: ["PENDING", "OVERDUE", "EXPIRED"] },
        dueAt: { lte: now },
      },
    }),
    prisma.due.count({
      where: {
        memberId: details.id,
        purpose: "CONTRIBUTION",
        status: { in: ["PENDING", "OVERDUE", "EXPIRED"] },
        dueAt: { lte: now },
      },
    }),
    effectiveSchemeNumber(prisma, "inactiveExpiredDuesThreshold", now),
  ]);
  const activeCoordinator =
    details.coordinatorProfile?.status === "ACTIVE" &&
    !details.coordinatorProfile.isSuspended &&
    details.user.roles.length > 0;
  return {
    ...profile,
    designation: activeCoordinator ? "Coordinator" : "Member",
    validity: cardValidity({
      status: profile.status,
      feeExempt: !!details.coordinatorProfile,
      restrictedByDues:
        overdueContributions >= threshold || (!details.coordinatorProfile && overdueMembership > 0),
      annualSettled: !!annualDue && ["PAID", "WAIVED"].includes(annualDue.status),
      paymentDeadline:
        annualDue && !["PAID", "WAIVED", "CANCELLED"].includes(annualDue.status)
          ? annualDue.dueAt
          : null,
      cycleEnd,
      now,
    }),
  };
}
