export const SCHEME_DEFAULTS = Object.freeze({
  annualMembershipFeePaise: 36900,
  planRegistrationFeePaise: 100000,
  deathContributionPaise: 10000,
  supportPaymentPaise: 10000000,
  initialWaitingMonths: 6,
  contributionDueDays: 30,
  membershipGraceMonths: 3,
  reminderIntervalDays: 5,
  inactiveExpiredDuesThreshold: 6,
  closedInactiveMonths: 12,
});
export type SchemeSettings = typeof SCHEME_DEFAULTS;
export const settingKeys = Object.keys(SCHEME_DEFAULTS) as (keyof SchemeSettings)[];
