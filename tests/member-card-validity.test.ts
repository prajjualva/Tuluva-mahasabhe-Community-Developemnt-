import { describe, expect, it } from "vitest";
import { cardValidity } from "../src/server/members/member-card-service";

const paid = {
  status: "ACTIVE",
  feeExempt: false,
  restrictedByDues: false,
  annualSettled: true,
  paymentDeadline: null,
  cycleEnd: new Date("2027-11-17T12:00:00Z"),
  now: new Date("2026-11-19T12:00:00Z"),
};
describe("membership ID card validity", () => {
  it("uses the current settled billing cycle for the validity date", () => {
    expect(cardValidity(paid)).toEqual({ label: "Valid until", value: "17 Nov 2027" });
  });
  it.each(["INACTIVE", "CLOSED", "DECEASED"])(
    "does not present %s membership as a valid paid year",
    (status) => {
      expect(cardValidity({ ...paid, status }).value).toBe("Inactive");
    },
  );
  it("does not claim a full paid year when renewal is pending or contributions restrict membership", () => {
    expect(cardValidity({ ...paid, restrictedByDues: true }).value).toBe("Inactive");
    expect(
      cardValidity({
        ...paid,
        annualSettled: false,
        paymentDeadline: new Date("2027-02-17T12:00:00Z"),
      }).value,
    ).toBe("Payment due by 17 Feb 2027");
    expect(cardValidity({ ...paid, status: "GRACE", annualSettled: false }).value).toBe(
      "Grace period",
    );
  });
  it("represents Coordinator fee exemption without inventing a paid expiry date", () => {
    expect(cardValidity({ ...paid, feeExempt: true, annualSettled: false })).toEqual({
      label: "Membership validity",
      value: "Active · fee exempt",
    });
  });
});
