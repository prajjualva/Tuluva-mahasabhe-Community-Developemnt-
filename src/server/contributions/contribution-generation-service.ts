import { Prisma } from "@prisma/client";
import { z } from "zod";
import { SCHEME_DEFAULTS } from "../../domain/scheme-settings";
import { prisma } from "../database/prisma";

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
  "contributionEvent" | "member" | "due" | "contribution" | "auditLog"
>;

type ObligationCandidate = {
  id: string;
  joinedAt: Date;
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
) {
  return members
    .filter(
      (member) =>
        member.joinedAt.getTime() <= eventCreatedAt.getTime() && !existingMemberIds.has(member.id),
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
    },
  });
  if (!event) throw new Error("Contribution event not found");
  if (event.status !== "APPROVED")
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
      data: { publishedAt },
    });
  }

  // Do not filter by Member.status. Inactive members must receive the exact
  // same obligation, and support eligibility deliberately is not joined here.
  const candidates = await tx.member.findMany({
    where: {
      joinedAt: { lte: event.createdAt },
      contributions: { none: { eventId: event.id } },
    },
    select: { id: true, joinedAt: true },
  });
  const dueAt = contributionDueDeadline(publishedAt);
  const dueExternalIds: string[] = [];

  for (const memberId of contributionObligationMemberIds(candidates, event.createdAt)) {
    // Both rows are written in this same transaction. If the unique
    // Contribution(eventId, memberId) key collides during a concurrent replay,
    // the whole transaction rolls back and the outer retry rereads the event.
    const due = await tx.due.create({
      data: {
        memberId,
        purpose: "CONTRIBUTION",
        amountPaise: SCHEME_DEFAULTS.deathContributionPaise,
        dueAt,
      },
      select: { id: true, externalId: true },
    });
    await tx.contribution.create({
      data: {
        eventId: event.id,
        memberId,
        amountPaise: SCHEME_DEFAULTS.deathContributionPaise,
        dueId: due.id,
      },
    });
    dueExternalIds.push(due.externalId);
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
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isRetriableTransactionError(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Contribution generation could not be completed");
}
