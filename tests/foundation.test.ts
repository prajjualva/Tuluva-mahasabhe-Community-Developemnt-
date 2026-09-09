import { describe, expect, it } from "vitest";
import { MONEY, rupees } from "../src/domain/money";
import { SCHEME_DEFAULTS } from "../src/domain/scheme-settings";
import { applyWalletTransaction } from "../src/domain/wallet";
import { requirePermission } from "../src/server/auth/authorization";
import { assertOverrideReason } from "../src/server/audit/audit";
import { createLedgerEntry } from "../src/domain/ledger";
import { paymentCommandKey } from "../src/server/payments/idempotency";
import { mayReadNomineeBankDetails } from "../src/server/auth/sensitive-access";
import { issueOtp, OTP_EXPIRY_MS, verifyOtp } from "../src/server/auth/otp-service";
import {
  assertMemberAccess,
  canChangeCoordinator,
  registerMember,
} from "../src/server/members/member-service";
import {
  makePendingNomineeChange,
  validateNomineeSet,
} from "../src/server/members/nominee-service";
import {
  assertAssignedMemberAccess,
  canUseReferral,
  coordinatorSuspensionPlan,
  createReferralCode,
} from "../src/server/coordinators/coordinator-service";
import { createCashCollection } from "../src/server/coordinators/cash-service";
import { createDeathReport } from "../src/server/coordinators/death-report-service";
import { adminOverride, approveNews } from "../src/server/admin/admin-service";
import {
  createContributionDue,
  createMembershipDue,
  canReactivate,
  expireDue,
  fifoAllocate,
  handleDeceased,
  membershipStatus,
  membershipStatusAfterContributionPayment,
} from "../src/server/membership/membership-engine";
import {
  allocateWalletPayment,
  planRegistrationDue,
  receiptNumber,
} from "../src/server/payments/payment-engine";

describe("financial foundation", () => {
  it("uses exact integer paise for mandated amounts", () => {
    expect(MONEY).toEqual({
      membershipFee: 36900,
      planRegistration: 100000,
      contribution: 10000,
      supportPayment: 10000000,
    });
    expect(() => rupees(1.5)).toThrow();
  });
  it("centralizes scheme defaults", () => {
    expect(SCHEME_DEFAULTS.contributionDueDays).toBe(30);
    expect(SCHEME_DEFAULTS.inactiveExpiredDuesThreshold).toBe(6);
  });
  it("maintains wallet integrity", () => {
    expect(applyWalletTransaction(10000, "DEBIT", 10000).balanceAfterPaise).toBe(0);
    expect(() => applyWalletTransaction(0, "DEBIT", 1)).toThrow("Insufficient");
  });
  it("requires valid idempotency input for financial commands", () => {
    const id = crypto.randomUUID();
    expect(paymentCommandKey(id, "a-unique-request-key")).toContain(id);
    expect(() => paymentCommandKey("not-a-uuid", "short")).toThrow();
  });
  it("creates only valid ledger entries", () => {
    expect(createLedgerEntry("CREDIT", 10000, "Contribution").amountPaise).toBe(10000);
    expect(() => createLedgerEntry("DEBIT", 0, "Refund")).toThrow();
  });
});

describe("member registration and identity safety", () => {
  const input = {
    fullName: "Asha Shetty",
    email: "asha@example.com",
    mobile: "+919876543210",
    referralCode: "COORD01",
    address: "Mangaluru, Karnataka",
    password: "A very secure password",
  };
  const store = (
    overrides: Partial<{ email: boolean; mobile: boolean; coordinator: boolean }> = {},
  ) => ({
    findUserByEmail: async () => overrides.email ?? false,
    findUserByMobile: async () => overrides.mobile ?? false,
    findActiveCoordinator: async () =>
      overrides.coordinator === false ? null : { id: crypto.randomUUID() },
    createMember: async () => ({
      memberExternalId: crypto.randomUUID(),
    }),
  });
  it("registers only through an active referral", async () => {
    await expect(registerMember(store(), input)).resolves.toHaveProperty("memberExternalId");
    await expect(registerMember(store({ coordinator: false }), input)).rejects.toThrow("Referral");
  });
  it("rejects duplicate email and mobile", async () => {
    await expect(registerMember(store({ email: true }), input)).rejects.toThrow("Email");
    await expect(registerMember(store({ mobile: true }), input)).rejects.toThrow("Mobile");
  });
  it("prevents member-to-member IDOR", () => {
    expect(() => assertMemberAccess(crypto.randomUUID(), crypto.randomUUID())).toThrow("Forbidden");
  });
});

describe("OTP and nominee safety", () => {
  it("expires OTPs and rate limits issuance", () => {
    const issued = issueOtp("+919876543210", "LOGIN", "secret", 0);
    expect(() =>
      verifyOtp(issued.record, issued.code, "secret", new Date(Date.now() + OTP_EXPIRY_MS + 1)),
    ).toThrow("expired");
    expect(() => issueOtp("+919876543210", "LOGIN", "secret", 5)).toThrow("rate");
  });
  it("keeps a nominee replacement pending", () => {
    expect(makePendingNomineeChange(crypto.randomUUID()).status).toBe("PENDING_VERIFICATION");
    expect(() => validateNomineeSet([{ kind: "PRIMARY", isCurrent: true }])).toThrow("secondary");
  });
  it("allows only active coordinators to be selected", () => {
    expect(canChangeCoordinator(false)).toBe(true);
    expect(canChangeCoordinator(true)).toBe(false);
  });
});

describe("Coordinator and Admin controls", () => {
  const coordinator = {
    id: crypto.randomUUID(),
    status: "ACTIVE" as const,
    referralCode: "TULUVA01",
  };
  const coordinatorPrincipal = {
    userId: crypto.randomUUID(),
    permissions: new Set(["coordinator:members:manage"]),
  };
  const admin = { userId: crypto.randomUUID(), permissions: new Set(["admin:*"]) };
  it("keeps referral codes unique and suspends them immediately", () => {
    expect(createReferralCode(new Set(), "tuluva01")).toBe("TULUVA01");
    expect(() => createReferralCode(new Set(["TULUVA01"]), "tuluva01")).toThrow("use");
    expect(canUseReferral({ ...coordinator, status: "SUSPENDED" })).toBe(false);
  });
  it("scopes Coordinators to their assigned Members", () => {
    expect(() =>
      assertAssignedMemberAccess(coordinatorPrincipal, coordinator, crypto.randomUUID()),
    ).toThrow("not assigned");
    expect(() =>
      assertAssignedMemberAccess(
        { ...coordinatorPrincipal, coordinatorSuspended: true },
        coordinator,
        coordinator.id,
      ),
    ).toThrow();
  });
  it("requires a safe suspension plan and does not disclose suspension", () => {
    expect(coordinatorSuspensionPlan("FOUNDATION_ADMIN").memberMessage).not.toContain("suspended");
    expect(() => coordinatorSuspensionPlan("TRANSFER")).toThrow("replacement");
  });
  it("creates pending-only cash records and blocks discrepancies", () => {
    expect(
      createCashCollection({
        amountPaise: 10000,
        purpose: "CONTRIBUTION",
        sequence: 184,
        unresolvedDiscrepancy: false,
      }).receiptNumber,
    ).toBe("CASH-2026-000184");
    expect(() =>
      createCashCollection({
        amountPaise: 10000,
        purpose: "CONTRIBUTION",
        sequence: 1,
        unresolvedDiscrepancy: true,
      }),
    ).toThrow("discrepancy");
  });
  it("does not generate contributions from a death report", () => {
    expect(
      createDeathReport(
        { searchedMemberFound: false, placeOfDeath: "Mangaluru", dateOfDeath: new Date() },
        null,
      ).type,
    ).toBe("MEMBER_NOT_FOUND");
    expect(() =>
      createDeathReport(
        {
          searchedMemberFound: true,
          memberExternalId: crypto.randomUUID(),
          placeOfDeath: "Mangaluru",
          dateOfDeath: new Date(),
        },
        { status: "DECEASED" },
      ),
    ).toThrow("Duplicate");
  });
  it("requires Admin authority and audit reason for overrides", () => {
    expect(adminOverride(admin, "STATUS", "Reviewed evidence").audited).toBe(true);
    expect(approveNews(admin, "PENDING_APPROVAL")).toBe("PUBLISHED");
  });
});

describe("membership and contribution engine", () => {
  it("creates ₹369 with a three-month grace date", () => {
    const due = createMembershipDue(new Date("2026-01-01"));
    expect(due.amountPaise).toBe(36900);
    expect(due.dueAt).toEqual(new Date("2026-04-01"));
  });
  it("creates ₹100 dues for active and inactive members who existed when an event was created", () => {
    expect(
      createContributionDue("active", new Date("2026-01-01"), new Date("2026-01-02")),
    ).not.toBeNull();
    expect(
      createContributionDue("inactive", new Date("2026-01-01"), new Date("2026-01-02")),
    ).not.toBeNull();
  });
  it("excludes later members, prevents duplicate event dues, and expires after 30 days", () => {
    expect(
      createContributionDue("event", new Date("2026-02-01"), new Date("2026-01-01")),
    ).toBeNull();
    const due = createContributionDue("event", new Date("2026-01-01"), new Date("2026-01-01"))!;
    expect(expireDue(due, new Date("2026-02-01")).status).toBe("EXPIRED");
    expect(
      createContributionDue(
        "event",
        new Date("2026-01-01"),
        new Date("2026-01-01"),
        new Set(["event"]),
      ),
    ).toBeNull();
  });
  it("applies FIFO and transitions after six actual expiries", () => {
    const first = createContributionDue("one", new Date("2026-01-01"), new Date("2026-01-01"))!;
    const second = createContributionDue("two", new Date("2026-01-01"), new Date("2026-01-02"))!;
    expect(fifoAllocate([second, first], 10000)[0].dueId).toBe(first.id);
    expect(membershipStatus(6, false)).toBe("INACTIVE");
  });
  it("waives unpaid dues and cancels AutoPay on death", () => {
    expect(handleDeceased([createMembershipDue()]).mandateStatus).toBe("CANCELLED");
  });
  it("does not reactivate on a ₹100 payment and requires all dues plus current ₹369", () => {
    expect(membershipStatusAfterContributionPayment("INACTIVE")).toBe("INACTIVE");
    expect(canReactivate([{ ...createMembershipDue(), status: "EXPIRED" }], true)).toBe(false);
    expect(canReactivate([{ ...createMembershipDue(), status: "PAID" }], true)).toBe(true);
  });
});

describe("plan payment and wallet foundation", () => {
  it("uses wallet first only when sufficient, except eligible plan split payments", () => {
    expect(allocateWalletPayment(10000, 36900)).toEqual({ walletPaise: 0, onlinePaise: 36900 });
    expect(allocateWalletPayment(50000, 100000, true)).toEqual({
      walletPaise: 50000,
      onlinePaise: 50000,
    });
  });
  it("creates exact ₹1,000 plan dues and official receipts", () => {
    expect(planRegistrationDue(new Date("2026-01-01")).amountPaise).toBe(100000);
    expect(receiptNumber(184, 2026)).toBe("RCP-2026-000184");
  });
});
describe("authorization and audit foundation", () => {
  it("removes coordinator permissions immediately when suspended", () =>
    expect(() =>
      requirePermission(
        {
          userId: crypto.randomUUID(),
          permissions: new Set(["coordinator:cash:collect"]),
          coordinatorSuspended: true,
        },
        "coordinator:cash:collect",
      ),
    ).toThrow("suspended"));
  it("allows admin override authority and blocks unauthorized calls", () => {
    expect(() =>
      requirePermission(
        { userId: crypto.randomUUID(), permissions: new Set(["admin:*"]) },
        "admin:any",
      ),
    ).not.toThrow();
    expect(() =>
      requirePermission(
        { userId: crypto.randomUUID(), permissions: new Set() },
        "nominee:bank:verify",
      ),
    ).toThrow("Forbidden");
  });
  it("requires override audit reasons", () => {
    expect(() => assertOverrideReason("ADMIN_OVERRIDE_STATUS")).toThrow("reason");
    expect(() => assertOverrideReason("ADMIN_OVERRIDE_STATUS", "Evidence reviewed")).not.toThrow();
  });
  it("does not disclose nominee bank data to unrelated users", () => {
    const member = crypto.randomUUID();
    expect(
      mayReadNomineeBankDetails({ userId: crypto.randomUUID(), permissions: new Set() }, member),
    ).toBe(false);
    expect(mayReadNomineeBankDetails({ userId: member, permissions: new Set() }, member)).toBe(
      true,
    );
  });
});
