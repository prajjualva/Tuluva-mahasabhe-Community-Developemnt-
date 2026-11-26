import { describe, expect, it } from "vitest";
import { membershipCardPaymentSatisfied } from "../src/server/members/member-card-access";
describe("ID-card payment requirement", () => {
  const unpaid = {
    coordinatorProfile: null,
    membershipGrants: [],
    dues: [{ status: "PENDING", payments: [] }],
  };
  it("rejects missing accounts, unpaid dues, unchecked paid flags and ordinary waivers", () => {
    expect(membershipCardPaymentSatisfied(null)).toBe(false);
    expect(membershipCardPaymentSatisfied(unpaid)).toBe(false);
    expect(
      membershipCardPaymentSatisfied({ ...unpaid, dues: [{ status: "PAID", payments: [] }] }),
    ).toBe(false);
    expect(
      membershipCardPaymentSatisfied({ ...unpaid, dues: [{ status: "WAIVED", payments: [] }] }),
    ).toBe(false);
  });
  it("accepts settled membership funds or explicit Foundation exemptions", () => {
    expect(
      membershipCardPaymentSatisfied({ ...unpaid, dues: [{ status: "PAID", payments: [{}] }] }),
    ).toBe(true);
    expect(membershipCardPaymentSatisfied({ ...unpaid, coordinatorProfile: {} })).toBe(true);
    expect(membershipCardPaymentSatisfied({ ...unpaid, membershipGrants: [{}] })).toBe(true);
  });
});
