import { describe, expect, it } from "vitest";
import {
  contributionDueDeadline,
  contributionObligationMemberIds,
  generateContributionDuesInTransaction,
} from "../src/server/contributions/contribution-generation-service";

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

describe("persistent contribution generation", () => {
  const eventCreatedAt = new Date("2026-01-10T10:00:00.000Z");

  it("uses membership existence at event creation, never current status or support eligibility", () => {
    const members = [
      { id: "active", joinedAt: new Date("2026-01-01"), status: "ACTIVE", supportEligible: true },
      {
        id: "inactive",
        joinedAt: new Date("2026-01-01"),
        status: "INACTIVE",
        supportEligible: false,
      },
      { id: "later", joinedAt: new Date("2026-01-11"), status: "ACTIVE", supportEligible: true },
    ];

    expect(contributionObligationMemberIds(members, eventCreatedAt)).toEqual([
      "active",
      "inactive",
    ]);
  });

  it("keeps the historical cutoff inclusive and never returns a known event/member obligation", () => {
    const members = [{ id: "same-instant", joinedAt: eventCreatedAt }];
    expect(contributionObligationMemberIds(members, eventCreatedAt)).toEqual(["same-instant"]);
    expect(
      contributionObligationMemberIds(members, eventCreatedAt, new Set(["same-instant"])),
    ).toEqual([]);
  });

  it("uses the published date for the thirty-day payment deadline", () => {
    expect(contributionDueDeadline(new Date("2026-01-10T10:00:00.000Z"))).toEqual(
      new Date("2026-02-09T10:00:00.000Z"),
    );
  });

  it("rejects a publication timestamp before the event was created", async () => {
    const tx = {
      contributionEvent: {
        findUnique: async () => ({
          id: uuid("6"),
          externalId: uuid("7"),
          status: "APPROVED" as const,
          publishedAt: null,
          createdAt: eventCreatedAt,
        }),
      },
    };

    await expect(
      generateContributionDuesInTransaction(tx as never, {
        eventExternalId: uuid("7"),
        publishedAt: new Date("2026-01-09T10:00:00.000Z"),
      }),
    ).rejects.toThrow("before it was created");
  });

  it("persists each event/member contribution and due exactly once on replay", async () => {
    const event = {
      id: uuid("1"),
      externalId: uuid("2"),
      status: "APPROVED" as const,
      publishedAt: null as Date | null,
      createdAt: eventCreatedAt,
    };
    const members = [
      { id: uuid("3"), joinedAt: new Date("2026-01-01"), status: "ACTIVE" },
      { id: uuid("4"), joinedAt: new Date("2026-01-01"), status: "INACTIVE" },
      { id: uuid("5"), joinedAt: new Date("2026-01-11"), status: "ACTIVE" },
    ];
    const dues: Array<{ id: string; externalId: string; memberId: string }> = [];
    const contributions: Array<{ eventId: string; memberId: string; dueId: string }> = [];
    const audits: Array<{ action: string }> = [];
    let sequence = 10;
    const tx = {
      contributionEvent: {
        findUnique: async () => event,
        update: async ({ data }: { data: { publishedAt: Date } }) => {
          event.publishedAt = data.publishedAt;
          return event;
        },
      },
      member: {
        findMany: async () =>
          members.filter(
            (member) =>
              member.joinedAt <= event.createdAt &&
              !contributions.some(
                (contribution) =>
                  contribution.eventId === event.id && contribution.memberId === member.id,
              ),
          ),
      },
      due: {
        create: async ({ data }: { data: { memberId: string } }) => {
          const due = {
            id: uuid(String(sequence++)),
            externalId: uuid(String(sequence++)),
            memberId: data.memberId,
          };
          dues.push(due);
          return due;
        },
      },
      contribution: {
        create: async ({
          data,
        }: {
          data: { eventId: string; memberId: string; dueId: string };
        }) => {
          if (
            contributions.some(
              (contribution) =>
                contribution.eventId === data.eventId && contribution.memberId === data.memberId,
            )
          )
            throw new Error("duplicate contribution");
          contributions.push(data);
          return data;
        },
      },
      auditLog: {
        create: async ({ data }: { data: { action: string } }) => {
          audits.push({ action: data.action });
          return data;
        },
      },
    };

    const input = { eventExternalId: event.externalId, publishedAt: new Date("2026-01-12") };
    const first = await generateContributionDuesInTransaction(tx as never, input);
    const second = await generateContributionDuesInTransaction(tx as never, input);

    expect(first.createdCount).toBe(2);
    expect(second.createdCount).toBe(0);
    expect(dues).toHaveLength(2);
    expect(contributions).toHaveLength(2);
    expect(contributions.map((contribution) => contribution.memberId)).toEqual([
      members[0]!.id,
      members[1]!.id,
    ]);
    expect(audits.map((audit) => audit.action)).toEqual([
      "CONTRIBUTION_EVENT_PUBLISHED",
      "CONTRIBUTION_DUES_GENERATED",
    ]);
  });
});
