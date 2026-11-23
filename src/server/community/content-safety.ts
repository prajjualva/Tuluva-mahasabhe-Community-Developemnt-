import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/prisma";
import { assertNewsVisibleToMember } from "../news/community-news-service";

export const contentTargetInput = z
  .object({
    kind: z.enum(["NEWS_COMMENT", "EVENT_COMMENT"]),
    parentExternalId: z.string().uuid(),
    commentExternalId: z.string().uuid(),
  })
  .strict();
export const contentReportInput = contentTargetInput
  .extend({ reason: z.string().trim().min(3).max(1000) })
  .strict();
export const reportReviewInput = z
  .object({
    reportExternalId: z.string().uuid(),
    decision: z.enum(["REMOVED", "DISMISSED"]),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
type Target = z.infer<typeof contentTargetInput>;

async function visibleComment(tx: Prisma.TransactionClient, actorId: string, target: Target) {
  const member = await tx.member.findUnique({
    where: { userId: actorId },
    select: { status: true },
  });
  if (!member || ["CLOSED", "DECEASED"].includes(member.status)) throw new Error("Forbidden");
  if (target.kind === "NEWS_COMMENT") {
    const { news } = await assertNewsVisibleToMember(tx, target.parentExternalId, actorId);
    const comment = await tx.newsComment.findFirst({
      where: { externalId: target.commentExternalId, newsId: news.id, status: "PUBLISHED" },
      select: { userId: true },
    });
    if (!comment) throw new Error("Comment not found");
    return comment;
  }
  const comment = await tx.comment.findFirst({
    where: {
      externalId: target.commentExternalId,
      status: "PUBLISHED",
      event: { externalId: target.parentExternalId, status: { in: ["PUBLISHED", "CLOSED"] } },
    },
    select: { userId: true },
  });
  if (!comment) throw new Error("Comment not found");
  return comment;
}

export async function reportContent(actorId: string, raw: unknown) {
  const input = contentReportInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    await visibleComment(tx, actorId, input);
    const report = await tx.contentReport.upsert({
      where: {
        reporterId_kind_commentExternalId: {
          reporterId: actorId,
          kind: input.kind,
          commentExternalId: input.commentExternalId,
        },
      },
      create: { reporterId: actorId, ...input },
      update: {},
      select: { externalId: true, status: true },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "CONTENT_REPORTED",
        entityType: "ContentReport",
        entityId: report.externalId,
      },
    });
    return report;
  });
}

/** Resolve author on the server, never accept an arbitrary user ID from the browser. */
export async function blockCommentAuthor(actorId: string, raw: unknown) {
  const input = contentTargetInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const comment = await visibleComment(tx, actorId, input);
    if (comment.userId === actorId) throw new Error("You cannot block yourself");
    const block = await tx.userBlock.upsert({
      where: { ownerId_blockedUserId: { ownerId: actorId, blockedUserId: comment.userId } },
      create: { ownerId: actorId, blockedUserId: comment.userId },
      update: {},
      select: { externalId: true },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "COMMENT_AUTHOR_BLOCKED",
        entityType: "UserBlock",
        entityId: block.externalId,
      },
    });
    return block;
  });
}

export async function listOwnBlocks(actorId: string) {
  return prisma.userBlock
    .findMany({
      where: { ownerId: actorId },
      select: {
        externalId: true,
        createdAt: true,
        blockedUser: { select: { member: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
    .then((rows) =>
      rows.map(({ blockedUser, ...row }) => ({
        ...row,
        name: blockedUser.member?.fullName ?? "Community member",
      })),
    );
}

export async function unblockAuthor(actorId: string, externalId: string) {
  z.string().uuid().parse(externalId);
  return prisma.$transaction(async (tx) => {
    const removed = await tx.userBlock.deleteMany({ where: { externalId, ownerId: actorId } });
    if (removed.count)
      await tx.auditLog.create({
        data: {
          actorId,
          action: "COMMENT_AUTHOR_UNBLOCKED",
          entityType: "UserBlock",
          entityId: externalId,
        },
      });
    return { unblocked: true };
  });
}

export async function listContentReports() {
  const reports = await prisma.contentReport.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      externalId: true,
      kind: true,
      commentExternalId: true,
      parentExternalId: true,
      reason: true,
      createdAt: true,
    },
  });
  return Promise.all(
    reports.map(async (report) => {
      const comment =
        report.kind === "NEWS_COMMENT"
          ? await prisma.newsComment.findUnique({
              where: { externalId: report.commentExternalId },
              select: { body: true, status: true },
            })
          : await prisma.comment.findUnique({
              where: { externalId: report.commentExternalId },
              select: { body: true, status: true },
            });
      return { ...report, comment };
    }),
  );
}

export async function reviewContentReport(actorId: string, raw: unknown) {
  const input = reportReviewInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const report = await tx.contentReport.findUnique({
      where: { externalId: input.reportExternalId },
    });
    if (!report) throw new Error("Report not found");
    // A conditional claim serializes competing decisions and makes retries harmless.
    const claimed = await tx.contentReport.updateMany({
      where: { externalId: report.externalId, status: "OPEN" },
      data: {
        status: input.decision,
        reviewedAt: new Date(),
        reviewedById: actorId,
        reviewReason: input.reason,
      },
    });
    if (!claimed.count)
      return tx.contentReport.findUniqueOrThrow({
        where: { externalId: report.externalId },
        select: { externalId: true, status: true },
      });
    if (input.decision === "REMOVED") {
      const where = { externalId: report.commentExternalId, status: "PUBLISHED" as const };
      const data = {
        status: "MODERATED" as const,
        moderatedAt: new Date(),
        moderatedById: actorId,
        moderationReason: input.reason,
      };
      if (report.kind === "NEWS_COMMENT") await tx.newsComment.updateMany({ where, data });
      else await tx.comment.updateMany({ where, data });
    }
    await tx.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        action: "CONTENT_REPORT_REVIEWED",
        entityType: "ContentReport",
        entityId: report.externalId,
        reason: input.reason,
        afterState: { status: input.decision, commentExternalId: report.commentExternalId },
      },
    });
    return { externalId: report.externalId, status: input.decision };
  });
}
