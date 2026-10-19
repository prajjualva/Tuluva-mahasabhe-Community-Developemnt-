import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SCHEME_DEFAULTS } from "../../domain/scheme-settings";
import { prisma } from "../database/prisma";
import { effectiveSchemeNumber } from "../database/scheme-policy";

const contributionGenerationInput = z.object({
  eventExternalId: z.string().uuid(),
  actorId: z.string().uuid().optional(),
  // Supplying this is useful for a publishing command and deterministic jobs.
  // Once an event is published, its recorded timestamp always wins.
  publishedAt: z.coerce.date().optional(),
});

export type ContributionGenerationInput = z.input<typeof contributionGenerationInput>;

type ContributionGenerationTransaction = Pick<
  Prisma.TransactionClient,
  | "contributionEvent"
  | "member"
  | "due"
  | "contribution"
  | "auditLog"
  | "notification"
  | "schemeSettingVersion"
>;

type ObligationCandidate = {
  id: string;
  joinedAt: Date;
  userId?: string;
  deceasedAt?: Date | null;
};

const addUtcDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

/**
 * The contribution rule intentionally considers only historical membership.
 * Current ACTIVE/INACTIVE state and ₹1 lakh support eligibility are unrelated
 * to whether this ₹100 obligation exists.
 */
export function contributionObligationMemberIds(
  members: readonly ObligationCandidate[],
  eventCreatedAt: Date,
  existingMemberIds: ReadonlySet<string> = new Set(),
  excludedMemberId?: string | null,
) {
  return members
    .filter(
      (member) =>
        member.joinedAt.getTime() <= eventCreatedAt.getTime() &&
        (!member.deceasedAt || member.deceasedAt > eventCreatedAt) &&
        !existingMemberIds.has(member.id) &&
        member.id !== excludedMemberId,
    )
    .map((member) => member.id);
}

export function contributionDueDeadline(publishedAt: Date) {
  return addUtcDays(publishedAt, SCHEME_DEFAULTS.contributionDueDays);
}

/**
 * Generates durable ₹100 dues for an approved event inside the caller's Prisma
 * transaction. The Contribution(eventId, memberId) unique key is the final
 * idempotency guard; this method never examines current membership status,
 * plan eligibility, or the deceased member's support-case eligibility.
 */
export async function generateContributionDuesInTransaction(
  tx: ContributionGenerationTransaction,
  rawInput: ContributionGenerationInput,
) {
  const input = contributionGenerationInput.parse(rawInput);
  const event = await tx.contributionEvent.findUnique({
    where: { externalId: input.eventExternalId },
    select: {
      id: true,
      externalId: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      deathCase: { select: { memberId: true } },
    },
  });
  if (!event) throw new Error("Contribution event not found");
  if (!["APPROVED", "PUBLISHED"].includes(event.status))
    throw new Error("Contribution dues may only be generated for an approved event");

  // Publishing and obligation generation are atomically linked. The cutoff
  // remains event.createdAt even if approval/publication happens later.
  const newlyPublished = event.publishedAt === null;
  const publishedAt = event.publishedAt ?? input.publishedAt ?? new Date();
  if (newlyPublished && publishedAt.getTime() < event.createdAt.getTime())
    throw new Error("A contribution event cannot be published before it was created");
  if (newlyPublished) {
    await tx.contributionEvent.update({
      where: { id: event.id },
      data: { publishedAt, status: "PUBLISHED" },
    });
  }

  // Membership existence at event creation is the entire obligation rule:
  // do not filter by current status or support eligibility here.
  const candidates = await tx.member.findMany({
    where: {
      joinedAt: { lte: event.createdAt },
      OR: [{ deceasedAt: null }, { deceasedAt: { gt: event.createdAt } }],
      ...(event.deathCase?.memberId ? { id: { not: event.deathCase.memberId } } : {}),
      contributions: { none: { eventId: event.id } },
    },
    select: { id: true, joinedAt: true, userId: true, deceasedAt: true, status: true },
  });
  const dueAt = addUtcDays(
    publishedAt,
    await effectiveSchemeNumber(tx, "contributionDueDays", publishedAt),
  );
  const amountPaise = await effectiveSchemeNumber(tx, "deathContributionPaise", publishedAt);
  const dueExternalIds: string[] = [];

  const eligibleMemberIds = contributionObligationMemberIds(
    candidates,
    event.createdAt,
    new Set(),
    event.deathCase?.memberId,
  );
  // Preallocate UUIDs so the entire event is generated with bulk writes rather
  // than three remote database round trips per member. The event/member unique
  // constraint still rolls back the entire transaction on a concurrent replay.
  const deceasedMemberIds = new Set(
    candidates
      .filter((candidate) => candidate.status === "DECEASED")
      .map((candidate) => candidate.id),
  );
  const dues = eligibleMemberIds.map((memberId) => ({
    id: randomUUID(),
    externalId: randomUUID(),
    memberId,
    purpose: "CONTRIBUTION",
    amountPaise,
    dueAt,
    // Preserve a historical obligation but immediately waive it if death was
    // recorded after the event cutoff and before this publication command.
    status: deceasedMemberIds.has(memberId) ? ("WAIVED" as const) : ("PENDING" as const),
  }));
  if (dues.length) {
    await tx.due.createMany({ data: dues });
    await tx.contribution.createMany({
      data: dues.map((due) => ({
        eventId: event.id,
        memberId: due.memberId,
        amountPaise: due.amountPaise,
        dueId: due.id,
      })),
    });
    const recipients = new Map(candidates.map((candidate) => [candidate.id, candidate.userId]));
    const notifications = dues.flatMap((due) => {
      const userId = recipients.get(due.memberId);
      if (!userId || due.status === "WAIVED") return [];
      return [
        {
          userId,
          channel: "IN_APP",
          type: "EVENT_CONTRIBUTION_DUE",
          title: "₹100 Death Support contribution due",
          body: "A new approved Death Support Event has created a ₹100 contribution due. Review and pay it in your member portal before its deadline.",
          template: "EVENT_CONTRIBUTION_DUE_CREATED",
          relatedExternalId: event.externalId,
          payload: { eventExternalId: event.externalId, dueExternalId: due.externalId },
          idempotencyKey: `contribution-due:${event.id}:${due.memberId}`,
          sentAt: new Date(),
        },
      ];
    });
    if (notifications.length)
      await tx.notification.createMany({ data: notifications, skipDuplicates: true });
    dueExternalIds.push(...dues.map((due) => due.externalId));
  }

  if (newlyPublished) {
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorId ? undefined : "SYSTEM",
        action: "CONTRIBUTION_EVENT_PUBLISHED",
        entityType: "ContributionEvent",
        entityId: event.id,
        afterState: { publishedAt: publishedAt.toISOString() },
      },
    });
  }
  if (dueExternalIds.length > 0) {
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorId ? undefined : "SYSTEM",
        action: "CONTRIBUTION_DUES_GENERATED",
        entityType: "ContributionEvent",
        entityId: event.id,
        afterState: {
          dueCount: dueExternalIds.length,
          dueAt: dueAt.toISOString(),
          membershipCutoffAt: event.createdAt.toISOString(),
        },
      },
    });
  }

  return {
    eventExternalId: event.externalId,
    publishedAt,
    membershipCutoffAt: event.createdAt,
    dueAt,
    createdCount: dueExternalIds.length,
    dueExternalIds,
  };
}

const isRetriableTransactionError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === "P2034" || error.code === "P2002");

/**
 * Production entry point. Serializable isolation plus the schema's unique
 * event/member constraint makes processing an approved event safely replayable.
 */
export async function generateContributionDuesForApprovedEvent(
  rawInput: ContributionGenerationInput,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => generateContributionDuesInTransaction(tx, rawInput),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 30000,
        },
      );
    } catch (error) {
      if (!isRetriableTransactionError(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Contribution generation could not be completed");
}
