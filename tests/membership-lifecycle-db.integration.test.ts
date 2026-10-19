import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import {
  processMemberBilling,
  membershipCycleKey,
  reopenClosedMembership,
} from "../src/server/membership/membership-lifecycle-service";
import { reactivateMembership } from "../src/server/membership/reactivation-service";
import { createCoordinatorProfile } from "../src/server/admin/admin-command-service";
import {
  applyFoundationWalletCredit,
  payDueFromWallet,
} from "../src/server/payments/wallet-service";
import { startPlanRegistration } from "../src/server/plans/plan-service";
import { addUtcCalendarMonths } from "../src/domain/calendar";

const run = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const users: string[] = [];
const members: string[] = [];
const coordinators: string[] = [];
async function fixture(status: "ACTIVE" | "INACTIVE" = "ACTIVE", joinedAt = new Date()) {
  const marker = crypto.randomUUID();
  const user = await prisma.user.create({ data: { email: `lifecycle-${marker}@example.invalid` } });
  users.push(user.id);
  const member = await prisma.member.create({
    data: {
      userId: user.id,
      fullName: "Synthetic lifecycle member",
      address: "Synthetic test only",
      status,
      joinedAt,
      membershipBillingAnchor: joinedAt,
    },
  });
  members.push(member.id);
  return { user, member, marker };
}
(run ? describe : describe.skip)("persistent membership financial lifecycle", () => {
  it("creates exactly one annual renewal and applies calendar grace", async () => {
    const now = new Date();
    const anchor = addUtcCalendarMonths(now, -13);
    const { member } = await fixture("ACTIVE", anchor);
    await prisma.membership.create({
      data: { memberId: member.id, status: "ACTIVE", startedAt: anchor },
    });
    await prisma.due.create({
      data: {
        memberId: member.id,
        purpose: "MEMBERSHIP",
        amountPaise: 36900,
        status: "PAID",
        paidAt: anchor,
        dueAt: addUtcCalendarMonths(anchor, 3),
        createdAt: anchor,
        billingCycleKey: membershipCycleKey(member.id, anchor, 0),
      },
    });
    const first = await processMemberBilling(member.id, now);
    const replay = await processMemberBilling(member.id, now);
    expect(first.created).toBe(1);
    expect(replay.created).toBe(0);
    const renewal = await prisma.due.findUniqueOrThrow({
      where: { billingCycleKey: membershipCycleKey(member.id, anchor, 1) },
    });
    expect(renewal.amountPaise).toBe(36900);
    expect(renewal.dueAt).toEqual(addUtcCalendarMonths(anchor, 15));
    expect((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).status).toBe(
      "GRACE",
    );
  }, 120_000);

  it("requires six expired contributions and all dues plus current ₹369 for reactivation, without a second plan fee", async () => {
    const { user, member, marker } = await fixture();
    const now = new Date();
    await prisma.membership.create({
      data: { memberId: member.id, status: "ACTIVE", startedAt: member.joinedAt },
    });
    const waitingEndsAt = addUtcCalendarMonths(now, 6);
    const plan = await prisma.communitySupportPlan.create({
      data: { memberId: member.id, status: "ACTIVE", activatedAt: now, waitingEndsAt },
    });
    const membership = await prisma.due.create({
      data: {
        memberId: member.id,
        purpose: "MEMBERSHIP",
        amountPaise: 36900,
        dueAt: addUtcCalendarMonths(now, 3),
        billingCycleKey: membershipCycleKey(member.id, member.joinedAt, 0),
      },
    });
    const contributions = [];
    for (let index = 0; index < 5; index += 1)
      contributions.push(
        await prisma.due.create({
          data: {
            memberId: member.id,
            purpose: "CONTRIBUTION",
            amountPaise: 10000,
            status: "EXPIRED",
            dueAt: new Date(now.getTime() - 86400000),
          },
        }),
      );
    await processMemberBilling(member.id);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).status).toBe(
      "GRACE",
    );
    contributions.push(
      await prisma.due.create({
        data: {
          memberId: member.id,
          purpose: "CONTRIBUTION",
          amountPaise: 10000,
          dueAt: new Date(now.getTime() - 1000),
        },
      }),
    );
    await processMemberBilling(member.id);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).status).toBe(
      "INACTIVE",
    );
    await applyFoundationWalletCredit(
      member.id,
      96900,
      "SYNTHETIC_TEST_CREDIT",
      user.id,
      "Synthetic lifecycle funding",
      `lifecycle-credit-${marker}`,
    );
    await payDueFromWallet(
      member.id,
      contributions[0].id,
      user.id,
      `lifecycle-contribution-${contributions[0].externalId}`,
    );
    expect((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).status).toBe(
      "INACTIVE",
    );
    await expect(reactivateMembership(member.id, user.id)).rejects.toThrow("outstanding");
    for (const due of contributions.slice(1))
      await payDueFromWallet(
        member.id,
        due.id,
        user.id,
        `lifecycle-contribution-${due.externalId}`,
      );
    await expect(reactivateMembership(member.id, user.id)).rejects.toThrow("outstanding");
    await payDueFromWallet(member.id, membership.id, user.id, `lifecycle-fee-${marker}`);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).status).toBe(
      "INACTIVE",
    );
    await reactivateMembership(member.id, user.id);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).status).toBe(
      "ACTIVE",
    );
    expect(
      await prisma.due.count({ where: { memberId: member.id, purpose: "PLAN_REGISTRATION" } }),
    ).toBe(0);
    const restored = await prisma.communitySupportPlan.findUniqueOrThrow({
      where: { id: plan.id },
    });
    expect(restored.status).toBe("ACTIVE");
    expect(restored.waitingEndsAt).toEqual(waitingEndsAt);
  }, 300_000);

  it("closes after one full year inactive and permits only an audited Admin reopening preserving wallet/history", async () => {
    const now = new Date();
    const { user, member, marker } = await fixture("INACTIVE", addUtcCalendarMonths(now, -25));
    await prisma.membership.create({
      data: { memberId: member.id, status: "INACTIVE", startedAt: addUtcCalendarMonths(now, -13) },
    });
    await applyFoundationWalletCredit(
      member.id,
      12345,
      "SYNTHETIC_TEST_CREDIT",
      user.id,
      "Synthetic preserved wallet",
      `closed-wallet-${marker}`,
    );
    await processMemberBilling(member.id);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).status).toBe(
      "CLOSED",
    );
    await expect(startPlanRegistration(member.id, user.id)).rejects.toThrow(
      "Only Foundation Admin",
    );
    const oldDues = await prisma.due.findMany({
      where: { memberId: member.id },
      select: { id: true },
    });
    const result = await reopenClosedMembership(user.id, member.externalId, {
      reason: "Synthetic Admin reopening decision",
    });
    expect(result.memberExternalId).toBe(member.externalId);
    expect(result.status).toBe("GRACE");
    expect((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).joinedAt).toEqual(
      member.joinedAt,
    );
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { memberId: member.id } })).balancePaise,
    ).toBe(12345);
    expect(
      await prisma.due.count({
        where: { id: { in: oldDues.map((due) => due.id) }, status: "CANCELLED" },
      }),
    ).toBe(oldDues.length);
    expect(
      (
        await prisma.due.findMany({
          where: { memberId: member.id, status: "PENDING" },
          select: { amountPaise: true },
        })
      )
        .map((due) => due.amountPaise)
        .sort((a, b) => a - b),
    ).toEqual([36900, 100000]);
    expect(
      (
        await prisma.communitySupportPlan.findUniqueOrThrow({
          where: { externalId: result.planExternalId },
        })
      ).isReopening,
    ).toBe(true);
  }, 120_000);

  it("exempts Coordinators from ₹369 and ₹1,000 while preserving ₹100 dues and permanent referrals", async () => {
    const { user, member, marker } = await fixture();
    const now = new Date();
    const plan = await prisma.communitySupportPlan.create({
      data: { memberId: member.id, status: "PAYMENT_PENDING" },
    });
    await prisma.due.createMany({
      data: [
        {
          memberId: member.id,
          purpose: "MEMBERSHIP",
          amountPaise: 36900,
          dueAt: addUtcCalendarMonths(now, 3),
        },
        {
          memberId: member.id,
          planId: plan.id,
          purpose: "PLAN_REGISTRATION",
          amountPaise: 100000,
          dueAt: new Date(now.getTime() + 86400000),
        },
        {
          memberId: member.id,
          purpose: "CONTRIBUTION",
          amountPaise: 10000,
          dueAt: new Date(now.getTime() + 86400000),
        },
      ],
    });
    const coordinator = await createCoordinatorProfile(user.id, {
      memberExternalId: member.externalId,
      referralCode: `LC${marker.replaceAll("-", "").slice(0, 12)}`,
      reason: "Synthetic Coordinator appointment",
    });
    coordinators.push(
      (
        await prisma.coordinator.findUniqueOrThrow({
          where: { externalId: coordinator.externalId },
        })
      ).id,
    );
    expect(
      await prisma.due.count({
        where: {
          memberId: member.id,
          purpose: { in: ["MEMBERSHIP", "PLAN_REGISTRATION"] },
          status: "WAIVED",
        },
      }),
    ).toBe(2);
    expect(
      await prisma.due.count({
        where: { memberId: member.id, purpose: "CONTRIBUTION", status: "PENDING" },
      }),
    ).toBe(1);
    expect(
      await prisma.communitySupportPlan.count({ where: { memberId: member.id, status: "ACTIVE" } }),
    ).toBe(1);
    await expect(
      prisma.coordinator.update({
        where: { externalId: coordinator.externalId },
        data: { referralCode: `CHANGED${marker.slice(0, 6)}` },
      }),
    ).rejects.toThrow("permanent");
    await processMemberBilling(member.id);
    expect(await prisma.due.count({ where: { memberId: member.id } })).toBe(3);
  }, 120_000);
});
afterAll(async () => {
  if (!run || !users.length) return;
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [{ actorId: { in: users } }, { entityId: { in: members } }],
    },
  });
  // System due/status audits are scoped through only these test entities.
  const dues = await prisma.due.findMany({
    where: { memberId: { in: members } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: dues.map((due) => due.id) } } });
  await prisma.foundationLedger.deleteMany({ where: { authorizedActorId: { in: users } } });
  await prisma.walletCreditCommand.deleteMany({ where: { memberId: { in: members } } });
  await prisma.walletTransaction.deleteMany({ where: { wallet: { memberId: { in: members } } } });
  await prisma.wallet.deleteMany({ where: { memberId: { in: members } } });
  await prisma.receipt.deleteMany({ where: { payment: { memberId: { in: members } } } });
  await prisma.payment.deleteMany({ where: { memberId: { in: members } } });
  await prisma.due.deleteMany({ where: { memberId: { in: members } } });
  await prisma.communitySupportPlan.deleteMany({ where: { memberId: { in: members } } });
  await prisma.membershipPeriod.deleteMany({
    where: { membership: { memberId: { in: members } } },
  });
  await prisma.membership.deleteMany({ where: { memberId: { in: members } } });
  await prisma.coordinatorLifecycleEvent.deleteMany({
    where: { coordinatorId: { in: coordinators } },
  });
  await prisma.coordinator.deleteMany({ where: { id: { in: coordinators } } });
  await prisma.member.deleteMany({ where: { id: { in: members } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}, 90_000);
