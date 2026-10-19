import { CommentStatus, NewsStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/prisma";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";

export const NEWS_AUDIENCES = ["COORDINATOR_MEMBERS", "FOUNDATION_WIDE"] as const;
export type NewsAudience = (typeof NEWS_AUDIENCES)[number];

const newsContentInput = z.object({
  title: z.string().trim().min(3).max(180),
  body: z.string().trim().min(3).max(10000),
});
const moderationReasonInput = z.string().trim().min(3).max(1000);

const safeNewsSelect = {
  externalId: true,
  title: true,
  body: true,
  audience: true,
  status: true,
  publishedAt: true,
  submittedAt: true,
  approvedAt: true,
  archivedAt: true,
  rejectionReason: true,
  archiveReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CommunityNewsSelect;

const safeNewsCommentSelect = {
  externalId: true,
  body: true,
  status: true,
  moderatedAt: true,
  moderationReason: true,
  createdAt: true,
  author: { select: { member: { select: { fullName: true } } } },
} satisfies Prisma.NewsCommentSelect;

export type SafeCommunityNews = Prisma.CommunityNewsGetPayload<{
  select: typeof safeNewsSelect;
}>;

type SafeNewsCommentRecord = Prisma.NewsCommentGetPayload<{
  select: typeof safeNewsCommentSelect;
}>;

function toSafeNewsComment(comment: SafeNewsCommentRecord) {
  return {
    externalId: comment.externalId,
    body: comment.body,
    status: comment.status,
    moderatedAt: comment.moderatedAt,
    moderationReason: comment.moderationReason,
    createdAt: comment.createdAt,
    authorName: comment.author.member?.fullName ?? "Community member",
  };
}

async function activeCoordinatorForUser(tx: Prisma.TransactionClient, userId: string) {
  const coordinator = await tx.coordinator.findFirst({
    where: { member: { userId }, isSuspended: false, status: "ACTIVE" },
    select: { id: true, memberId: true },
  });
  if (!coordinator) throw new Error("Coordinator access is suspended or unavailable");
  return coordinator;
}

async function assertNewsVisibleToMember(
  tx: Prisma.TransactionClient,
  newsExternalId: string,
  userId: string,
) {
  const member = await tx.member.findUnique({
    where: { userId },
    select: { id: true, coordinatorId: true, status: true },
  });
  if (!member || member.status === "DECEASED" || member.status === "CLOSED")
    throw new Error("News item not found");
  const news = await tx.communityNews.findFirst({
    where: {
      externalId: newsExternalId,
      status: "PUBLISHED",
      OR: [
        { audience: "FOUNDATION_WIDE" },
        ...(member.coordinatorId
          ? [{ audience: "COORDINATOR_MEMBERS", coordinatorId: member.coordinatorId }]
          : []),
      ],
    },
    select: { id: true, externalId: true, title: true },
  });
  if (!news) throw new Error("News item not found");
  return { member, news };
}

async function notifyNewsAudienceInTransaction(
  tx: Prisma.TransactionClient,
  news: {
    id: string;
    externalId: string;
    title: string;
    body: string;
    audience: string;
    coordinatorId: string | null;
  },
) {
  const recipients = await tx.member.findMany({
    where: {
      status: { notIn: ["DECEASED", "CLOSED"] },
      ...(news.audience === "FOUNDATION_WIDE" ? {} : { coordinatorId: news.coordinatorId }),
    },
    select: { userId: true },
  });
  if (!recipients.length) return 0;
  await tx.notification.createMany({
    data: recipients.map((recipient) => ({
      userId: recipient.userId,
      channel: "IN_APP",
      type: "COMMUNITY_NEWS",
      title: "Community news",
      body: news.title,
      template: "COMMUNITY_NEWS_PUBLISHED",
      relatedExternalId: news.externalId,
      payload: { newsExternalId: news.externalId, audience: news.audience },
      idempotencyKey: `news:${news.externalId}:recipient:${recipient.userId}`,
      sentAt: new Date(),
    })),
    skipDuplicates: true,
  });
  return recipients.length;
}

/** Coordinators can compose drafts and publish only to their own assigned members. */
export async function createCoordinatorNews(input: {
  actorId: string;
  title: string;
  body: string;
  publish?: boolean;
  audience?: NewsAudience;
}) {
  const content = newsContentInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const coordinator = await activeCoordinatorForUser(tx, input.actorId);
    const now = new Date();
    const foundationWide = input.audience === "FOUNDATION_WIDE";
    const news = await tx.communityNews.create({
      data: {
        title: content.title,
        body: content.body,
        audience: foundationWide ? "FOUNDATION_WIDE" : "COORDINATOR_MEMBERS",
        coordinatorId: coordinator.id,
        authorId: input.actorId,
        status: foundationWide ? "PENDING_APPROVAL" : input.publish ? "PUBLISHED" : "DRAFT",
        submittedAt: foundationWide ? now : null,
        publishedAt: !foundationWide && input.publish ? now : null,
      },
      select: {
        id: true,
        coordinatorId: true,
        ...safeNewsSelect,
      },
    });
    const notified =
      !foundationWide && input.publish ? await notifyNewsAudienceInTransaction(tx, news) : 0;
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: foundationWide
          ? "FOUNDATION_NEWS_SUBMITTED"
          : input.publish
            ? "COORDINATOR_NEWS_PUBLISHED"
            : "COORDINATOR_NEWS_DRAFT_CREATED",
        entityType: "CommunityNews",
        entityId: news.id,
        afterState: { externalId: news.externalId, audience: news.audience, notified },
      },
    });
    return stripNewsInternalFields(news);
  });
}

/** A Foundation-wide story is always placed in Admin approval rather than published directly. */
export async function submitFoundationNewsForApproval(input: {
  actorId: string;
  title: string;
  body: string;
}) {
  const content = newsContentInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const news = await tx.communityNews.create({
      data: {
        title: content.title,
        body: content.body,
        audience: "FOUNDATION_WIDE",
        authorId: input.actorId,
        status: "PENDING_APPROVAL",
        submittedAt: new Date(),
      },
      select: { id: true, ...safeNewsSelect },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "FOUNDATION_NEWS_SUBMITTED_FOR_APPROVAL",
        entityType: "CommunityNews",
        entityId: news.id,
        afterState: { externalId: news.externalId, audience: news.audience, status: news.status },
      },
    });
    return stripNewsInternalFields(news);
  });
}

export async function updateCoordinatorNewsDraft(input: {
  actorId: string;
  newsExternalId: string;
  title: string;
  body: string;
}) {
  const content = newsContentInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const coordinator = await activeCoordinatorForUser(tx, input.actorId);
    const news = await tx.communityNews.findFirst({
      where: {
        externalId: input.newsExternalId,
        coordinatorId: coordinator.id,
        authorId: input.actorId,
      },
      select: { id: true, status: true },
    });
    if (!news) throw new Error("News item not found");
    if (news.status !== "DRAFT") throw new Error("Only drafts can be edited");
    const updated = await tx.communityNews.update({
      where: { id: news.id },
      data: content,
      select: { id: true, ...safeNewsSelect },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "COORDINATOR_NEWS_DRAFT_UPDATED",
        entityType: "CommunityNews",
        entityId: updated.id,
      },
    });
    return stripNewsInternalFields(updated);
  });
}

export async function publishCoordinatorNews(input: { actorId: string; newsExternalId: string }) {
  return prisma.$transaction(async (tx) => {
    const coordinator = await activeCoordinatorForUser(tx, input.actorId);
    const news = await tx.communityNews.findFirst({
      where: {
        externalId: input.newsExternalId,
        audience: "COORDINATOR_MEMBERS",
        coordinatorId: coordinator.id,
        authorId: input.actorId,
      },
      select: { id: true, status: true },
    });
    if (!news) throw new Error("News item not found");
    if (news.status !== "DRAFT") throw new Error("Only drafts can be published by a Coordinator");
    const now = new Date();
    const published = await tx.communityNews.update({
      where: { id: news.id },
      data: { status: "PUBLISHED", publishedAt: now },
      select: {
        id: true,
        coordinatorId: true,
        ...safeNewsSelect,
      },
    });
    const notified = await notifyNewsAudienceInTransaction(tx, published);
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "COORDINATOR_NEWS_PUBLISHED",
        entityType: "CommunityNews",
        entityId: published.id,
        afterState: { externalId: published.externalId, notified },
      },
    });
    return stripNewsInternalFields(published);
  });
}

export async function approveFoundationNews(input: { actorId: string; newsExternalId: string }) {
  return prisma.$transaction(async (tx) => {
    const news = await tx.communityNews.findUnique({
      where: { externalId: input.newsExternalId },
      select: { id: true, status: true, audience: true, authorId: true },
    });
    if (!news) throw new Error("News item not found");
    if (news.status !== "PENDING_APPROVAL" || news.audience !== "FOUNDATION_WIDE")
      throw new Error("Only pending news can be approved");
    const now = new Date();
    const published = await tx.communityNews.update({
      where: { id: news.id },
      data: { status: "PUBLISHED", approvedById: input.actorId, approvedAt: now, publishedAt: now },
      select: {
        id: true,
        coordinatorId: true,
        ...safeNewsSelect,
      },
    });
    const notified = await notifyNewsAudienceInTransaction(tx, published);
    if (news.authorId && news.authorId !== input.actorId) {
      await createInAppNotificationInTransaction(tx, {
        userId: news.authorId,
        type: "COMMUNITY_NEWS",
        title: "Foundation news approved",
        body: `Your Foundation-wide news item “${published.title}” has been approved.`,
        template: "FOUNDATION_NEWS_APPROVED",
        relatedExternalId: published.externalId,
        idempotencyKey: `news:${published.externalId}:author:approved`,
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "FOUNDATION_NEWS_APPROVED_AND_PUBLISHED",
        entityType: "CommunityNews",
        entityId: published.id,
        afterState: { externalId: published.externalId, notified },
      },
    });
    return stripNewsInternalFields(published);
  });
}

export async function rejectFoundationNews(input: {
  actorId: string;
  newsExternalId: string;
  reason: string;
}) {
  const reason = moderationReasonInput.parse(input.reason);
  return prisma.$transaction(async (tx) => {
    const news = await tx.communityNews.findUnique({
      where: { externalId: input.newsExternalId },
      select: {
        id: true,
        status: true,
        audience: true,
        authorId: true,
        externalId: true,
        title: true,
      },
    });
    if (!news) throw new Error("News item not found");
    if (news.status !== "PENDING_APPROVAL" || news.audience !== "FOUNDATION_WIDE")
      throw new Error("Only pending news can be rejected");
    const rejected = await tx.communityNews.update({
      where: { id: news.id },
      data: { status: "REJECTED", approvedById: input.actorId, rejectionReason: reason },
      select: { id: true, ...safeNewsSelect },
    });
    if (news.authorId) {
      await createInAppNotificationInTransaction(tx, {
        userId: news.authorId,
        type: "COMMUNITY_NEWS",
        title: "Foundation news needs changes",
        body: `Your Foundation-wide news item “${news.title}” was not approved: ${reason}`,
        template: "FOUNDATION_NEWS_REJECTED",
        relatedExternalId: news.externalId,
        idempotencyKey: `news:${news.externalId}:author:rejected`,
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "FOUNDATION_NEWS_REJECTED",
        entityType: "CommunityNews",
        entityId: rejected.id,
        reason,
        afterState: { externalId: rejected.externalId, status: rejected.status },
      },
    });
    return stripNewsInternalFields(rejected);
  });
}

export async function archiveCommunityNews(input: {
  actorId: string;
  newsExternalId: string;
  reason: string;
}) {
  const reason = moderationReasonInput.parse(input.reason);
  return prisma.$transaction(async (tx) => {
    const news = await tx.communityNews.findUnique({
      where: { externalId: input.newsExternalId },
      select: { id: true, status: true },
    });
    if (!news) throw new Error("News item not found");
    if (news.status === "ARCHIVED") throw new Error("Archived news cannot be changed");
    const archived = await tx.communityNews.update({
      where: { id: news.id },
      data: { status: "ARCHIVED", archivedAt: new Date(), archiveReason: reason },
      select: { id: true, ...safeNewsSelect },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "COMMUNITY_NEWS_ARCHIVED",
        entityType: "CommunityNews",
        entityId: archived.id,
        reason,
        beforeState: { status: news.status },
        afterState: { externalId: archived.externalId, status: archived.status },
      },
    });
    return stripNewsInternalFields(archived);
  });
}

export async function listCommunityNewsForMember(userId: string) {
  const member = await prisma.member.findUnique({
    where: { userId },
    select: { coordinatorId: true, status: true },
  });
  if (!member || member.status === "DECEASED" || member.status === "CLOSED") return [];
  return prisma.communityNews.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { audience: "FOUNDATION_WIDE" },
        ...(member.coordinatorId
          ? [{ audience: "COORDINATOR_MEMBERS", coordinatorId: member.coordinatorId }]
          : []),
      ],
    },
    select: safeNewsSelect,
    orderBy: { publishedAt: "desc" },
    take: 100,
  });
}

export async function listCoordinatorNews(actorId: string) {
  return prisma.$transaction(async (tx) => {
    const coordinator = await activeCoordinatorForUser(tx, actorId);
    return tx.communityNews.findMany({
      where: { coordinatorId: coordinator.id, authorId: actorId },
      select: safeNewsSelect,
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  });
}

export async function listFoundationNewsForAdmin() {
  return prisma.communityNews.findMany({
    where: {},
    select: safeNewsSelect,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
  });
}

export async function listNewsCommentsForMember(newsExternalId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const { news } = await assertNewsVisibleToMember(tx, newsExternalId, userId);
    const comments = await tx.newsComment.findMany({
      where: { newsId: news.id, status: "PUBLISHED" },
      select: safeNewsCommentSelect,
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return comments.map(toSafeNewsComment);
  });
}

/** Returns moderation-visible news comments only after the caller's audience relationship is checked. */
export async function listNewsCommentsForModerator(input: {
  actorId: string;
  newsExternalId: string;
  moderator: "COORDINATOR" | "ADMIN";
}) {
  return prisma.$transaction(async (tx) => {
    const news = await tx.communityNews.findUnique({
      where: { externalId: input.newsExternalId },
      select: { id: true, coordinatorId: true, audience: true },
    });
    if (!news) throw new Error("News item not found");
    if (input.moderator === "COORDINATOR") {
      const coordinator = await activeCoordinatorForUser(tx, input.actorId);
      if (news.audience !== "COORDINATOR_MEMBERS" || news.coordinatorId !== coordinator.id)
        throw new Error("Forbidden");
    }
    const comments = await tx.newsComment.findMany({
      where: { newsId: news.id },
      select: safeNewsCommentSelect,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return comments.map(toSafeNewsComment);
  });
}

export async function addNewsComment(input: {
  newsExternalId: string;
  actorId: string;
  body: string;
}) {
  const body = z.string().trim().min(1).max(2000).parse(input.body);
  return prisma.$transaction(async (tx) => {
    const { news } = await assertNewsVisibleToMember(tx, input.newsExternalId, input.actorId);
    const comment = await tx.newsComment.create({
      data: { newsId: news.id, userId: input.actorId, body },
      select: safeNewsCommentSelect,
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "COMMUNITY_NEWS_COMMENT_ADDED",
        entityType: "NewsComment",
        entityId: comment.externalId,
        afterState: { newsExternalId: input.newsExternalId, commentExternalId: comment.externalId },
      },
    });
    return toSafeNewsComment(comment);
  });
}

/** Coordinators moderate only their own audience; Admins may moderate all news. */
export async function moderateNewsComment(input: {
  actorId: string;
  newsExternalId: string;
  commentExternalId: string;
  reason: string;
  moderator: "COORDINATOR" | "ADMIN";
}) {
  const reason = moderationReasonInput.parse(input.reason);
  return prisma.$transaction(async (tx) => {
    const news = await tx.communityNews.findUnique({
      where: { externalId: input.newsExternalId },
      select: { id: true, coordinatorId: true, audience: true },
    });
    if (!news) throw new Error("News item not found");
    if (input.moderator === "COORDINATOR") {
      const coordinator = await activeCoordinatorForUser(tx, input.actorId);
      if (news.audience !== "COORDINATOR_MEMBERS" || news.coordinatorId !== coordinator.id)
        throw new Error("Forbidden");
    }
    const comment = await tx.newsComment.findFirst({
      where: { externalId: input.commentExternalId, newsId: news.id },
      select: { id: true, status: true },
    });
    if (!comment) throw new Error("Comment not found");
    const updated =
      comment.status === CommentStatus.MODERATED
        ? await tx.newsComment.findUniqueOrThrow({
            where: { id: comment.id },
            select: safeNewsCommentSelect,
          })
        : await tx.newsComment.update({
            where: { id: comment.id },
            data: {
              status: "MODERATED",
              moderatedAt: new Date(),
              moderatedById: input.actorId,
              moderationReason: reason,
            },
            select: safeNewsCommentSelect,
          });
    if (comment.status !== CommentStatus.MODERATED) {
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "COMMUNITY_NEWS_COMMENT_MODERATED",
          entityType: "NewsComment",
          entityId: comment.id,
          reason,
          beforeState: { status: comment.status },
          afterState: { status: "MODERATED" },
        },
      });
    }
    return toSafeNewsComment(updated);
  });
}

function stripNewsInternalFields<T extends { id: string; coordinatorId?: string | null }>(
  news: T,
): Omit<T, "id" | "coordinatorId"> {
  const { id: _id, coordinatorId: _coordinatorId, ...safe } = news;
  void _id;
  void _coordinatorId;
  return safe;
}

export const communityNewsStatusValues = Object.values(NewsStatus);
