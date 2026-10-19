import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import {
  createInAppNotification,
  listNotificationsForUser,
  markNotificationReadForUser,
} from "../src/server/notifications/notification-service";
import {
  addNewsComment,
  approveFoundationNews,
  createCoordinatorNews,
  listCommunityNewsForMember,
  listNewsCommentsForMember,
  moderateNewsComment,
  submitFoundationNewsForApproval,
} from "../src/server/news/community-news-service";
import {
  changeMemberCoordinator,
  suspendCoordinatorAndReassign,
} from "../src/server/coordinators/coordinator-management-service";

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const databaseDescribe = runDatabaseTests ? describe : describe.skip;
let marker = "";
let userIds: string[] = [];
let memberIds: string[] = [];
let coordinatorIds: string[] = [];

databaseDescribe("Phase 9 Neon notifications, news, comments, and Coordinator lifecycle", () => {
  it("persists idempotent private notifications and enforces news audience/moderation boundaries", async () => {
    marker = crypto.randomUUID();
    const [admin, coordinatorUser, replacementUser, assignedUser, unrelatedUser] =
      await Promise.all(
        ["admin", "coordinator", "replacement", "assigned", "unrelated"].map((kind) =>
          prisma.user.create({ data: { email: `phase9-${kind}-${marker}@example.invalid` } }),
        ),
      );
    userIds = [admin.id, coordinatorUser.id, replacementUser.id, assignedUser.id, unrelatedUser.id];
    const [coordinatorMember, replacementMember, assignedMember, unrelatedMember] =
      await Promise.all([
        prisma.member.create({
          data: { userId: coordinatorUser.id, fullName: "Phase 9 Coordinator", address: "Test" },
        }),
        prisma.member.create({
          data: { userId: replacementUser.id, fullName: "Phase 9 Replacement", address: "Test" },
        }),
        prisma.member.create({
          data: { userId: assignedUser.id, fullName: "Phase 9 Assigned", address: "Test" },
        }),
        prisma.member.create({
          data: { userId: unrelatedUser.id, fullName: "Phase 9 Unrelated", address: "Test" },
        }),
      ]);
    memberIds = [coordinatorMember.id, replacementMember.id, assignedMember.id, unrelatedMember.id];
    const [coordinator, replacement] = await Promise.all([
      prisma.coordinator.create({
        data: {
          memberId: coordinatorMember.id,
          referralCode: `P9A${marker.replaceAll("-", "").slice(0, 8)}`,
        },
      }),
      prisma.coordinator.create({
        data: {
          memberId: replacementMember.id,
          referralCode: `P9B${marker.replaceAll("-", "").slice(0, 8)}`,
        },
      }),
    ]);
    coordinatorIds = [coordinator.id, replacement.id];
    await prisma.member.update({
      where: { id: assignedMember.id },
      data: { coordinatorId: coordinator.id },
    });

    const notificationInput = {
      userId: assignedUser.id,
      type: "REGISTRATION" as const,
      title: "Welcome",
      body: "Your account is ready.",
      idempotencyKey: `phase9-notification-${marker}`,
      payload: { password: "must-not-escape", safe: "visible-only-server-side" },
    };
    const notification = await createInAppNotification(notificationInput);
    const replay = await createInAppNotification(notificationInput);
    expect(replay.externalId).toBe(notification.externalId);
    const inbox = await listNotificationsForUser(assignedUser.id);
    expect(inbox.filter((item) => item.externalId === notification.externalId)).toHaveLength(1);
    expect(JSON.stringify(inbox)).not.toContain("must-not-escape");
    await expect(
      markNotificationReadForUser(unrelatedUser.id, notification.externalId),
    ).rejects.toThrow("Notification not found");
    expect(
      (await markNotificationReadForUser(assignedUser.id, notification.externalId)).readAt,
    ).toBeTruthy();

    const coordinatorNews = await createCoordinatorNews({
      actorId: coordinatorUser.id,
      title: "Assigned-member update",
      body: "This update is limited to the assigned community.",
      publish: true,
    });
    expect(
      (await listCommunityNewsForMember(assignedUser.id)).map((item) => item.externalId),
    ).toContain(coordinatorNews.externalId);
    expect(
      (await listCommunityNewsForMember(unrelatedUser.id)).map((item) => item.externalId),
    ).not.toContain(coordinatorNews.externalId);
    const comment = await addNewsComment({
      newsExternalId: coordinatorNews.externalId,
      actorId: assignedUser.id,
      body: "Thank you for the update.",
    });
    await expect(
      addNewsComment({
        newsExternalId: coordinatorNews.externalId,
        actorId: unrelatedUser.id,
        body: "This must not pass the audience check.",
      }),
    ).rejects.toThrow("News item not found");
    await moderateNewsComment({
      actorId: coordinatorUser.id,
      newsExternalId: coordinatorNews.externalId,
      commentExternalId: comment.externalId,
      reason: "Integration-test moderation",
      moderator: "COORDINATOR",
    });
    expect(await listNewsCommentsForMember(coordinatorNews.externalId, assignedUser.id)).toEqual(
      [],
    );

    const foundationNews = await submitFoundationNewsForApproval({
      actorId: admin.id,
      title: "Foundation update",
      body: "This requires a recorded approval before publication.",
    });
    const published = await approveFoundationNews({
      actorId: admin.id,
      newsExternalId: foundationNews.externalId,
    });
    expect(published.status).toBe("PUBLISHED");
    expect(
      (await listCommunityNewsForMember(unrelatedUser.id)).map((item) => item.externalId),
    ).toContain(foundationNews.externalId);

    const changed = await changeMemberCoordinator({
      actorId: admin.id,
      memberExternalId: assignedMember.externalId,
      replacementCoordinatorExternalId: replacement.externalId,
      reason: "Integration assignment change",
    });
    expect(changed.coordinatorExternalId).toBe(replacement.externalId);
    const suspension = await suspendCoordinatorAndReassign({
      actorId: admin.id,
      coordinatorExternalId: replacement.externalId,
      reason: "Integration temporary management",
      mode: "FOUNDATION_ADMIN",
    });
    expect(suspension).toMatchObject({ status: "SUSPENDED", affectedMemberCount: 1 });
    expect(
      await prisma.auditLog.count({
        where: {
          actorId: admin.id,
          action: {
            in: ["MEMBER_COORDINATOR_CHANGED", "COORDINATOR_SUSPENDED_AND_MEMBERS_REASSIGNED"],
          },
        },
      }),
    ).toBe(2);
  }, 180_000);
});

afterAll(async () => {
  if (!runDatabaseTests || !marker) return;
  await prisma.$transaction(
    async (tx) => {
      const news = await tx.communityNews.findMany({
        where: { authorId: { in: userIds } },
        select: { externalId: true },
      });
      await tx.notification.deleteMany({
        where: { relatedExternalId: { in: news.map((item) => item.externalId) } },
      });
      await tx.newsComment.deleteMany({ where: { news: { authorId: { in: userIds } } } });
      await tx.communityNews.deleteMany({ where: { authorId: { in: userIds } } });
      await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await tx.coordinatorTransfer.deleteMany({ where: { memberId: { in: memberIds } } });
      await tx.coordinatorLifecycleEvent.deleteMany({
        where: { coordinatorId: { in: coordinatorIds } },
      });
      await tx.coordinator.deleteMany({ where: { id: { in: coordinatorIds } } });
      await tx.member.deleteMany({ where: { id: { in: memberIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}, 90_000);
