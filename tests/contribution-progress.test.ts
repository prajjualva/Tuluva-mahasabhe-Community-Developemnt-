import { describe, expect, it } from "vitest";
import { contributionProgress } from "../src/domain/contribution-progress";

describe("public contribution progress", () => {
  it("counts paid obligations separately from pending, overdue and expired dues", () => {
    expect(contributionProgress(["PAID", "PAID", "PENDING", "OVERDUE", "EXPIRED"])).toEqual({
      total: 5,
      contributed: 2,
      remaining: 3,
      waived: 0,
      cancelled: 0,
    });
  });
  it("never presents waived, cancelled, or absent dues as contributions or outstanding", () => {
    expect(contributionProgress(["WAIVED", "CANCELLED", null])).toEqual({
      total: 3,
      contributed: 0,
      remaining: 0,
      waived: 1,
      cancelled: 1,
    });
  });
  it("handles events with no obligations", () => {
    expect(contributionProgress([]).total).toBe(0);
  });
  it("keeps all settled and outstanding categories consistent", () => {
    const progress = contributionProgress(["PAID", "PENDING", "OVERDUE"]);
    expect(progress.contributed + progress.remaining).toBe(progress.total);
  });
});
