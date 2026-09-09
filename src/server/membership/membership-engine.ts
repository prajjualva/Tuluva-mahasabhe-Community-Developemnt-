import { MONEY } from "../../domain/money";
export type Due = {
  id: string;
  purpose: "MEMBERSHIP" | "CONTRIBUTION" | "PLAN";
  amountPaise: number;
  createdAt: Date;
  dueAt: Date;
  status: "PENDING" | "EXPIRED" | "PAID" | "CANCELLED" | "WAIVED";
  eventId?: string;
};
export function createMembershipDue(now = new Date()): Due {
  return {
    id: crypto.randomUUID(),
    purpose: "MEMBERSHIP",
    amountPaise: MONEY.membershipFee,
    createdAt: now,
    dueAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, now.getUTCDate())),
    status: "PENDING",
  };
}
export function createContributionDue(
  eventId: string,
  memberStartedAt: Date,
  eventPublishedAt: Date,
  existingContributionEventIds: ReadonlySet<string> = new Set(),
): Due | null {
  if (memberStartedAt > eventPublishedAt) return null;
  if (existingContributionEventIds.has(eventId)) return null;
  return {
    id: crypto.randomUUID(),
    purpose: "CONTRIBUTION",
    amountPaise: MONEY.contribution,
    createdAt: eventPublishedAt,
    dueAt: new Date(eventPublishedAt.getTime() + 30 * 86400000),
    status: "PENDING",
    eventId,
  };
}
export function expireDue(due: Due, now = new Date()) {
  return due.status === "PENDING" && due.dueAt <= now
    ? { ...due, status: "EXPIRED" as const }
    : due;
}
export function membershipStatus(
  expiredContributionCount: number,
  membershipGraceExpired: boolean,
  inactiveSince?: Date,
  now = new Date(),
) {
  if (inactiveSince && now.getTime() >= inactiveSince.getTime() + 365 * 86400000) return "CLOSED";
  if (expiredContributionCount >= 6 || membershipGraceExpired) return "INACTIVE";
  return "ACTIVE";
}
export function fifoAllocate(dues: Due[], amountPaise: number, selectedDueId?: string) {
  const targets = selectedDueId
    ? dues.filter((d) => d.id === selectedDueId)
    : dues
        .filter((d) => d.status === "PENDING" || d.status === "EXPIRED")
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let remaining = amountPaise;
  return targets
    .map((due) => {
      const paid = Math.min(remaining, due.amountPaise);
      remaining -= paid;
      return { dueId: due.id, paid };
    })
    .filter((item) => item.paid > 0);
}
export function handleDeceased(dues: Due[]) {
  return {
    dues: dues.map((due) =>
      due.status === "PENDING" || due.status === "EXPIRED"
        ? { ...due, status: "WAIVED" as const }
        : due,
    ),
    mandateStatus: "CANCELLED" as const,
    futureDuesStopped: true,
  };
}

/** Paying a ₹100 contribution must never reactivate an inactive membership. */
export function membershipStatusAfterContributionPayment(currentStatus: "ACTIVE" | "INACTIVE") {
  return currentStatus;
}

export function canReactivate(dues: Due[], currentMembershipFeePaid: boolean) {
  return (
    currentMembershipFeePaid &&
    dues.every(
      (due) => due.status === "PAID" || due.status === "CANCELLED" || due.status === "WAIVED",
    )
  );
}
