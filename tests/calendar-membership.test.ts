import { describe, expect, it } from "vitest";
import { addUtcCalendarMonths, membershipBillingCycle } from "../src/domain/calendar";
import { contributionObligationMemberIds } from "../src/server/contributions/contribution-generation-service";
describe("calendar membership deadlines", () => {
  it("clamps month-end grace and waiting dates, including leap years", () => {
    expect(addUtcCalendarMonths(new Date("2026-01-31T12:30:00Z"), 3).toISOString()).toBe(
      "2026-04-30T12:30:00.000Z",
    );
    expect(addUtcCalendarMonths(new Date("2024-02-29T12:30:00Z"), 12).toISOString()).toBe(
      "2025-02-28T12:30:00.000Z",
    );
    expect(addUtcCalendarMonths(new Date("2026-08-31T12:30:00Z"), 6).toISOString()).toBe(
      "2027-02-28T12:30:00.000Z",
    );
  });
  it("starts a new annual cycle only at the anniversary", () => {
    const anchor = new Date("2024-02-29T12:30:00Z");
    expect(membershipBillingCycle(anchor, new Date("2025-02-28T12:29:59Z"))).toBe(0);
    expect(membershipBillingCycle(anchor, new Date("2025-02-28T12:30:00Z"))).toBe(1);
  });
  it("stops obligations after death without losing a historical pre-death obligation", () => {
    const member = {
      id: "member",
      joinedAt: new Date("2026-01-01"),
      deceasedAt: new Date("2026-02-01"),
    };
    expect(contributionObligationMemberIds([member], new Date("2026-01-31"))).toEqual(["member"]);
    expect(contributionObligationMemberIds([member], new Date("2026-02-01"))).toEqual([]);
  });
});
