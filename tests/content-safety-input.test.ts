import { describe, expect, it } from "vitest";
import {
  contentReportInput,
  contentTargetInput,
  reportReviewInput,
} from "../src/server/community/content-safety";
describe("Content safety validation", () => {
  const target = {
    kind: "EVENT_COMMENT",
    parentExternalId: crypto.randomUUID(),
    commentExternalId: crypto.randomUUID(),
  };
  it("rejects unknown content kinds, internal author IDs, empty reasons and extra fields", () => {
    expect(contentReportInput.safeParse({ ...target, reason: "" }).success).toBe(false);
    expect(
      contentReportInput.safeParse({ ...target, reason: "spam", userId: crypto.randomUUID() })
        .success,
    ).toBe(false);
    expect(contentTargetInput.safeParse({ ...target, kind: "BANK_DOCUMENT" }).success).toBe(false);
    expect(
      contentTargetInput.safeParse({ ...target, parentExternalId: "not-a-uuid" }).success,
    ).toBe(false);
    expect(contentReportInput.parse({ ...target, reason: "  Abusive content  " }).reason).toBe(
      "Abusive content",
    );
  });
  it("allows only final moderation decisions with a nonempty reason", () => {
    expect(
      reportReviewInput.safeParse({
        reportExternalId: crypto.randomUUID(),
        decision: "OPEN",
        reason: "retry",
      }).success,
    ).toBe(false);
    expect(
      reportReviewInput.safeParse({
        reportExternalId: crypto.randomUUID(),
        decision: "REMOVED",
        reason: "   ",
      }).success,
    ).toBe(false);
  });
});
