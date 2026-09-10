import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import {
  createPaymentCommand,
  failPayment,
  settlePayment,
} from "../src/server/payments/payment-service";
import {
  applyFoundationWalletCredit,
  startPlanWalletFirstSplitPayment,
} from "../src/server/payments/wallet-service";

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const databaseDescribe = runDatabaseTests ? describe : describe.skip;
const created = { userId: "", memberId: "", dueIds: [] as string[], planId: "" };

databaseDescribe("Phase 6 financial persistence safeguards", () => {
  it("enforces one payment attempt, records split legs, and compensates a failed plan checkout", async () => {
    const marker = crypto.randomUUID();
    const user = await prisma.user.create({ data: { email: `safety-${marker}@example.invalid` } });
    created.userId = user.id;
    const member = await prisma.member.create({
      data: { userId: user.id, fullName: "Payment Safety", address: "Test-only record" },
    });
    created.memberId = member.id;
    const membershipDue = await prisma.due.create({
      data: {
        memberId: member.id,
        purpose: "MEMBERSHIP",
        amountPaise: 36_900,
        dueAt: new Date(Date.now() + 86_400_000),
      },
    });
    created.dueIds.push(membershipDue.id);

    const firstKey = `safety-first-${marker}`;
    const contenders = await Promise.allSettled([
      createPaymentCommand({
        memberId: member.id,
        dueId: membershipDue.id,
        method: "ONLINE",
        idempotencyKey: firstKey,
        actorId: user.id,
      }),
      createPaymentCommand({
        memberId: member.id,
        dueId: membershipDue.id,
        method: "ONLINE",
        idempotencyKey: `safety-second-${marker}`,
        actorId: user.id,
      }),
    ]);
    const fulfilled = contenders.filter(
      (
        result,
      ): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createPaymentCommand>>> =>
        result.status === "fulfilled",
    );
    expect(fulfilled).toHaveLength(1);
    const payment = fulfilled[0].value;
    const pendingCount = await prisma.payment.count({
      where: { dueId: membershipDue.id, status: "PENDING" },
    });
    expect(pendingCount).toBe(1);

    const settled = await settlePayment(payment.id, user.id, `provider-${marker}`);
    expect(settled.receipt?.receiptNumber).toMatch(/^RCP-\d{4}-[A-F0-9]{32}$/);
    expect(
      await prisma.foundationLedger.count({ where: { relatedExternalId: payment.externalId } }),
    ).toBe(1);
    const replay = await createPaymentCommand({
      memberId: member.id,
      dueId: membershipDue.id,
      method: "ONLINE",
      idempotencyKey: payment.idempotencyKey,
      actorId: user.id,
    });
    expect(replay.id).toBe(payment.id);
    const plan = await prisma.communitySupportPlan.create({
      data: { memberId: member.id, status: "PAYMENT_PENDING" },
    });
    created.planId = plan.id;
    const planDue = await prisma.due.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        purpose: "PLAN_REGISTRATION",
        amountPaise: 100_000,
        dueAt: new Date(Date.now() + 86_400_000),
      },
    });
    created.dueIds.push(planDue.id);
    await applyFoundationWalletCredit(member.id, 40_000, "TEST_CREDIT", user.id);

    const firstSplit = await startPlanWalletFirstSplitPayment(
      member.id,
      planDue.id,
      user.id,
      `split-first-${crypto.randomUUID()}`,
    );
    expect(firstSplit.walletPaise).toBe(40_000);
    expect(firstSplit.onlinePayment.amountPaise).toBe(60_000);
    expect(firstSplit.walletPayment?.status).toBe("SUCCEEDED");
    expect(await prisma.receipt.count({ where: { paymentId: firstSplit.walletPayment?.id } })).toBe(
      1,
    );
    expect(
      await prisma.foundationLedger.count({
        where: { relatedExternalId: firstSplit.walletPayment?.externalId },
      }),
    ).toBe(1);

    await failPayment(firstSplit.onlinePayment.id, user.id);
    const refundedWallet = await prisma.wallet.findUniqueOrThrow({
      where: { memberId: member.id },
    });
    expect(refundedWallet.balancePaise).toBe(40_000);
    expect(
      await prisma.walletTransaction.count({
        where: {
          walletId: refundedWallet.id,
          direction: "CREDIT",
          purpose: "PLAN_REGISTRATION_WALLET_REFUND",
        },
      }),
    ).toBe(1);

    const retrySplit = await startPlanWalletFirstSplitPayment(
      member.id,
      planDue.id,
      user.id,
      `split-retry-${crypto.randomUUID()}`,
    );
    await settlePayment(
      retrySplit.onlinePayment.id,
      user.id,
      `provider-retry-${crypto.randomUUID()}`,
    );
    const paidDue = await prisma.due.findUniqueOrThrow({ where: { id: planDue.id } });
    const progressedPlan = await prisma.communitySupportPlan.findUniqueOrThrow({
      where: { id: plan.id },
    });
    expect(paidDue.status).toBe("PAID");
    expect(progressedPlan.status).toBe("PENDING_COORDINATOR_APPROVAL");
  }, 60_000);
});

afterAll(async () => {
  if (!runDatabaseTests || !created.userId) return;
  // This is test-only cleanup. Keep each remote Neon operation short so the
  // cleanup itself cannot exceed Prisma's default interactive transaction TTL.
  const payments = await prisma.payment.findMany({
    where: { memberId: created.memberId },
    select: { id: true },
  });
  if (payments.length)
    await prisma.receipt.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
  const wallet = created.memberId
    ? await prisma.wallet.findUnique({ where: { memberId: created.memberId } })
    : null;
  if (wallet) {
    await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
    await prisma.wallet.delete({ where: { id: wallet.id } });
  }
  await prisma.foundationLedger.deleteMany({ where: { authorizedActorId: created.userId } });
  await prisma.payment.deleteMany({ where: { memberId: created.memberId } });
  if (created.dueIds.length) await prisma.due.deleteMany({ where: { id: { in: created.dueIds } } });
  if (created.planId)
    await prisma.communitySupportPlan.deleteMany({ where: { id: created.planId } });
  await prisma.auditLog.deleteMany({ where: { actorId: created.userId } });
  if (created.memberId) await prisma.member.deleteMany({ where: { id: created.memberId } });
  await prisma.user.deleteMany({ where: { id: created.userId } });
  await prisma.$disconnect();
});
