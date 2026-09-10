import { describe, expect, it } from "vitest";
import { contributionObligationMemberIds } from "../src/server/contributions/contribution-generation-service";
import {
  deathEventEditInput,
  deathReportSubmissionInput,
  evaluateDeathSupportEligibility,
  eventCancellationInput,
  membershipStatusAtDeath,
} from "../src/server/death/death-workflow-service";
import {
  MAX_DEATH_DOCUMENT_BYTES,
  validateDeathEvidenceFile,
} from "../src/server/documents/death-document-storage";

describe("Phase 7 death support rules", () => {
  const dateOfDeath = new Date("2026-05-10T10:00:00.000Z");

  it("uses the membership state at death instead of a later member status", () => {
    const evaluation = evaluateDeathSupportEligibility(
      {
        // The member was marked DECEASED when the report was verified later;
        // that later state must not replace the state at the actual death date.
        status: "DECEASED",
        memberships: [
          {
            status: "ACTIVE",
            startedAt: new Date("2026-01-01T00:00:00.000Z"),
            endedAt: new Date("2026-05-12T00:00:00.000Z"),
          },
          {
            status: "DECEASED",
            startedAt: new Date("2026-05-12T00:00:00.000Z"),
            endedAt: null,
          },
        ],
        plans: [
          {
            status: "ACTIVE",
            activatedAt: new Date("2026-01-01T00:00:00.000Z"),
            waitingEndsAt: new Date("2026-04-01T00:00:00.000Z"),
          },
        ],
        nominees: [
          { id: "verified-primary", kind: "PRIMARY", status: "VERIFIED", isCurrent: true },
        ],
      },
      dateOfDeath,
    );

    expect(evaluation).toEqual({
      status: "ELIGIBLE",
      reason: "PRELIMINARY_ELIGIBLE",
      verifiedNomineeId: "verified-primary",
    });
  });

  it("sends inactive and waiting-period deaths to Administrator review", () => {
    const inactive = evaluateDeathSupportEligibility(
      {
        status: "ACTIVE",
        memberships: [{ status: "INACTIVE", startedAt: new Date("2026-01-01"), endedAt: null }],
        plans: [],
        nominees: [],
      },
      dateOfDeath,
    );
    expect(inactive).toMatchObject({
      status: "ADMIN_REVIEW",
      reason: "MEMBERSHIP_INACTIVE_AT_DEATH",
    });

    const waitingPeriod = evaluateDeathSupportEligibility(
      {
        status: "ACTIVE",
        memberships: [{ status: "ACTIVE", startedAt: new Date("2026-01-01"), endedAt: null }],
        plans: [
          {
            status: "ACTIVE",
            activatedAt: new Date("2026-05-01"),
            waitingEndsAt: new Date("2026-11-01"),
          },
        ],
        nominees: [{ id: "primary", kind: "PRIMARY", status: "VERIFIED", isCurrent: true }],
      },
      dateOfDeath,
    );
    expect(waitingPeriod).toMatchObject({
      status: "ADMIN_REVIEW",
      reason: "PLAN_WAITING_PERIOD_AT_DEATH",
    });

    const joinedAfterDeath = evaluateDeathSupportEligibility(
      {
        status: "ACTIVE",
        joinedAt: new Date("2026-05-11T00:00:00.000Z"),
        memberships: [],
        plans: [],
        nominees: [],
      },
      dateOfDeath,
    );
    expect(joinedAfterDeath).toMatchObject({
      status: "INELIGIBLE",
      reason: "MEMBERSHIP_NOT_STARTED_AT_DEATH",
    });
  });

  it("keeps contribution obligations independent from current status and excludes only the deceased subject", () => {
    const eventCreatedAt = new Date("2026-05-15T10:00:00.000Z");
    const members = [
      { id: "active", joinedAt: new Date("2026-01-01"), status: "ACTIVE" },
      { id: "inactive", joinedAt: new Date("2026-01-01"), status: "INACTIVE" },
      { id: "closed-later", joinedAt: new Date("2026-01-01"), status: "CLOSED" },
      { id: "deceased-subject", joinedAt: new Date("2026-01-01"), status: "DECEASED" },
      { id: "joined-later", joinedAt: new Date("2026-05-16"), status: "ACTIVE" },
    ];

    expect(
      contributionObligationMemberIds(members, eventCreatedAt, new Set(), "deceased-subject"),
    ).toEqual(["active", "inactive", "closed-later"]);
  });

  it("validates required death-report and administrative mutation inputs", () => {
    expect(() =>
      deathReportSubmissionInput.parse({
        reporterIdentity: "Reporter",
        placeOfDeath: "",
        dateOfDeath,
      }),
    ).toThrow();
    expect(() =>
      eventCancellationInput.parse({ reason: "", settlementMethod: "FOUNDATION_WALLET" }),
    ).toThrow();
    expect(() => deathEventEditInput.parse({ reason: "A valid audit reason" })).toThrow();
    expect(
      membershipStatusAtDeath(
        [{ status: "ACTIVE", startedAt: new Date("2026-01-01"), endedAt: null }],
        "CLOSED",
        dateOfDeath,
      ),
    ).toBe("ACTIVE");
  });

  it("rejects unsafe evidence metadata before storage", () => {
    expect(() =>
      validateDeathEvidenceFile({
        name: "not-an-image.txt",
        type: "text/plain",
        size: 1,
        arrayBuffer: async () => new ArrayBuffer(1),
      }),
    ).toThrow("Only PDF, JPEG, PNG, or WebP");
    expect(() =>
      validateDeathEvidenceFile({
        name: "too-large.pdf",
        type: "application/pdf",
        size: MAX_DEATH_DOCUMENT_BYTES + 1,
        arrayBuffer: async () => new ArrayBuffer(1),
      }),
    ).toThrow("10 MB");
  });
});
