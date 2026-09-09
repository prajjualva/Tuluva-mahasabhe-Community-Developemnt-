export type ReminderCandidate = {
  id: string;
  status: "PENDING" | "OVERDUE" | "EXPIRED" | "PAID" | "CANCELLED" | "WAIVED";
  dueAt: Date;
  lastReminderAt?: Date | null;
};
/** Returns only unpaid, unexpired dues that have waited at least five full days since their previous reminder. */
export function duesNeedingReminder<T extends ReminderCandidate>(dues: T[], now = new Date()): T[] {
  const intervalMs = 5 * 24 * 60 * 60 * 1000;
  return dues.filter(
    (due) =>
      (due.status === "PENDING" || due.status === "OVERDUE") &&
      due.dueAt > now &&
      (!due.lastReminderAt || now.getTime() - due.lastReminderAt.getTime() >= intervalMs),
  );
}

/** Registration dues become expired when their recorded 30-day deadline passes. */
export function planDuesNeedingExpiry<T extends ReminderCandidate>(
  dues: T[],
  now = new Date(),
): T[] {
  return dues.filter(
    (due) => (due.status === "PENDING" || due.status === "OVERDUE") && due.dueAt <= now,
  );
}
