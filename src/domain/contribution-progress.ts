export type ContributionProgress = {
  total: number;
  contributed: number;
  remaining: number;
  waived: number;
  cancelled: number;
};

/** Counts obligations, not payment attempts, receipts, or support eligibility. */
export function contributionProgress(statuses: readonly (string | null)[]): ContributionProgress {
  return {
    total: statuses.length,
    contributed: statuses.filter((status) => status === "PAID").length,
    remaining: statuses.filter(
      (status) => status === "PENDING" || status === "OVERDUE" || status === "EXPIRED",
    ).length,
    waived: statuses.filter((status) => status === "WAIVED").length,
    cancelled: statuses.filter((status) => status === "CANCELLED").length,
  };
}
