import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import {
  blockCommentAuthor,
  reportContent,
  unblockAuthor,
  reviewContentReport,
  listOwnBlocks,
  listContentReports,
} from "../src/server/community/content-safety";
import { listNewsCommentsForMember } from "../src/server/news/community-news-service";
import { listPublishedEventComments } from "../src/server/death/death-workflow-service";
const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const users: string[] = [];
let newsId: string | undefined;
let eventId: string | undefined;
let caseId: string | undefined;
(enabled ? describe : describe.skip)("Persistent content safety", () => {
  it("enforces private audience, duplicate protection, mutual blocks, ownership and audited moderation", async () => {
    const marker = crypto.randomUUID();
    const actors = await Promise.all(
      ["author", "reader", "outsider", "admin"].map((kind) =>
        prisma.user.create({
          data: {
            email: `safety-${kind}-${marker}@example.invalid`,
            member: { create: { fullName: kind, address: "Isolated safety test" } },
          },
        }),
      ),
    );
    users.push(...actors.map((a) => a.id));
    const [author, reader, outsider, admin] = actors;
    const news = await prisma.communityNews.create({
      data: {
        title: "Safety integration",
        body: "Verified discussion",
        audience: "FOUNDATION_WIDE",
        status: "PUBLISHED",
      },
    });
    newsId = news.id;
    const comment = await prisma.newsComment.create({
      data: { newsId: news.id, userId: author.id, body: "Test message" },
    });
    const reply = await prisma.newsComment.create({
      data: { newsId: news.id, userId: reader.id, body: "Reader reply" },
    });
    const target = {
      kind: "NEWS_COMMENT" as const,
      parentExternalId: news.externalId,
      commentExternalId: comment.externalId,
    };
    await expect(
      reportContent(reader.id, {
        ...target,
        parentExternalId: crypto.randomUUID(),
        reason: "Wrong parent",
      }),
    ).rejects.toThrow();
    await expect(
      reportContent(reader.id, {
        ...target,
        commentExternalId: crypto.randomUUID(),
        reason: "Unknown comment",
      }),
    ).rejects.toThrow();
    await prisma.communityNews.update({
      where: { id: news.id },
      data: { audience: "COORDINATOR_MEMBERS" },
    });
    await expect(
      reportContent(outsider.id, { ...target, reason: "Private discussion" }),
    ).rejects.toThrow();
    await expect(blockCommentAuthor(outsider.id, target)).rejects.toThrow();
    await prisma.communityNews.update({
      where: { id: news.id },
      data: { audience: "FOUNDATION_WIDE" },
    });
    const report = await reportContent(reader.id, { ...target, reason: "Abusive message" });
    const duplicate = await reportContent(reader.id, {
      ...target,
      reason: "Different retry reason",
    });
    expect(duplicate.externalId).toBe(report.externalId);
    expect(await prisma.contentReport.count({ where: { reporterId: reader.id } })).toBe(1);
    expect(
      (await listContentReports()).find((r) => r.externalId === report.externalId)?.comment?.body,
    ).toBe("Test message");
    await expect(blockCommentAuthor(author.id, target)).rejects.toThrow("yourself");
    const block = await blockCommentAuthor(reader.id, target);
    expect((await blockCommentAuthor(reader.id, target)).externalId).toBe(block.externalId);
    expect(
      (await listNewsCommentsForMember(news.externalId, reader.id)).map((c) => c.externalId),
    ).not.toContain(comment.externalId);
    expect(
      (await listNewsCommentsForMember(news.externalId, author.id)).map((c) => c.externalId),
    ).not.toContain(reply.externalId);
    expect((await listNewsCommentsForMember(news.externalId, outsider.id)).length).toBe(2);
    await unblockAuthor(outsider.id, block.externalId);
    expect(await listOwnBlocks(reader.id)).toHaveLength(1);
    await unblockAuthor(reader.id, block.externalId);
    expect(await listOwnBlocks(reader.id)).toHaveLength(0);
    expect((await listNewsCommentsForMember(news.externalId, reader.id)).length).toBe(2);
    const dismissed = await reviewContentReport(admin.id, {
      reportExternalId: report.externalId,
      decision: "DISMISSED",
      reason: "Does not violate rules",
    });
    expect(dismissed.status).toBe("DISMISSED");
    expect((await prisma.newsComment.findUniqueOrThrow({ where: { id: comment.id } })).status).toBe(
      "PUBLISHED",
    );
    const second = await reportContent(outsider.id, {
      ...target,
      reason: "Moderator review required",
    });
    await expect(
      reviewContentReport(admin.id, {
        reportExternalId: second.externalId,
        decision: "REMOVED",
        reason: "",
      }),
    ).rejects.toThrow();
    await reviewContentReport(admin.id, {
      reportExternalId: second.externalId,
      decision: "REMOVED",
      reason: "Violates community rules",
    });
    await reviewContentReport(admin.id, {
      reportExternalId: second.externalId,
      decision: "DISMISSED",
      reason: "Retry must not reverse decision",
    });
    expect(
      (await prisma.contentReport.findUniqueOrThrow({ where: { externalId: second.externalId } }))
        .status,
    ).toBe("REMOVED");
    expect((await prisma.newsComment.findUniqueOrThrow({ where: { id: comment.id } })).status).toBe(
      "MODERATED",
    );
    expect(
      (await listNewsCommentsForMember(news.externalId, reader.id)).map((c) => c.externalId),
    ).not.toContain(comment.externalId);
    const event = await prisma.contributionEvent.create({
      data: {
        status: "PUBLISHED",
        deathCase: {
          create: {
            reporterIdentity: "Isolated review test",
            placeOfDeath: "Test",
            dateOfDeath: new Date(),
          },
        },
      },
    });
    eventId = event.id;
    caseId = event.deathCaseId;
    const condolence = await prisma.comment.create({
      data: { eventId: event.id, userId: author.id, body: "A respectful condolence" },
    });
    const eventTarget = {
      kind: "EVENT_COMMENT" as const,
      parentExternalId: event.externalId,
      commentExternalId: condolence.externalId,
    };
    await blockCommentAuthor(reader.id, eventTarget);
    expect(await listPublishedEventComments(event.externalId, reader.id)).toHaveLength(0);
    expect(await listPublishedEventComments(event.externalId)).toHaveLength(1);
    await expect(
      reportContent(reader.id, {
        ...eventTarget,
        parentExternalId: crypto.randomUUID(),
        reason: "Wrong event",
      }),
    ).rejects.toThrow();
    const eventReport = await reportContent(reader.id, {
      ...eventTarget,
      reason: "Requires review",
    });
    await reviewContentReport(admin.id, {
      reportExternalId: eventReport.externalId,
      decision: "REMOVED",
      reason: "Review decision recorded",
    });
    expect(await listPublishedEventComments(event.externalId)).toHaveLength(0);
    await prisma.contributionEvent.update({
      where: { id: event.id },
      data: { status: "CANCELLED" },
    });
    await expect(blockCommentAuthor(outsider.id, eventTarget)).rejects.toThrow();
    expect(
      await prisma.auditLog.count({
        where: { actorId: admin.id, action: "CONTENT_REPORT_REVIEWED" },
      }),
    ).toBe(3);
  }, 180000);
});
afterAll(async () => {
  if (!enabled || !users.length) return;
  await prisma.$transaction(
    async (tx) => {
      await tx.contentReport.deleteMany({ where: { reporterId: { in: users } } });
      await tx.userBlock.deleteMany({ where: { ownerId: { in: users } } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: users } } });
      if (newsId) {
        await tx.newsComment.deleteMany({ where: { newsId } });
        await tx.communityNews.delete({ where: { id: newsId } });
      }
      if (eventId) {
        await tx.comment.deleteMany({ where: { eventId } });
        await tx.contributionEvent.delete({ where: { id: eventId } });
      }
      if (caseId) await tx.deathCase.delete({ where: { id: caseId } });
      await tx.member.deleteMany({ where: { userId: { in: users } } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    },
    { timeout: 30000 },
  );
}, 90000);
