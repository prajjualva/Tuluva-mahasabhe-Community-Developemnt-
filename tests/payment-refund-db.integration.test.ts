import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import {
  payDueFromWallet,
  applyFoundationWalletCredit,
} from "../src/server/payments/wallet-service";
import { requestPaymentRefund } from "../src/server/payments/payment-refund-service";
import { cancelPendingPayment, createPaymentCommand } from "../src/server/payments/payment-service";

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const databaseDescribe = runDatabaseTests ? describe : describe.skip;
const created = { userId: "", memberId: "", dueIds: [] as string[], paymentIds: [] as string[] };

databaseDescribe("payment refund persistence", () => {
  it("keeps the settled wallet payment immutable and appends one compensating refund", async () => {
    const marker = crypto.randomUUID();
    const user = await prisma.user.create({ data: { email: `refund-${marker}@example.invalid` } });
    created.userId = user.id;
    const member = await prisma.member.create({
      data: { userId: user.id, fullName: "Refund Test Member", address: "Test-only record" },
    });
    created.memberId = member.id;
    const due = await prisma.due.create({
      data: {
        memberId: member.id,
        purpose: "MEMBERSHIP",
        amountPaise: 36_900,
        dueAt: new Date(Date.now() + 86_400_000),
      },
    });
    created.dueIds.push(due.id);
    await applyFoundationWalletCredit(member.id, 36_900, "TEST_REFUND_CREDIT", user.id);
    const settled = await payDueFromWallet(member.id, due.id, user.id, `refund-pay-${marker}`);
    created.paymentIds.push(settled.payment.id);

    const refund = await requestPaymentRefund({
      paymentExternalId: settled.payment.externalId,
      actorId: user.id,
      reason: "Duplicate member payment",
      idempotencyKey: `refund-command-${marker}`,
    });
    expect(refund.outcome).toBe("SUCCEEDED");
    expect(refund.refund.status).toBe("SUCCEEDED");
    const replay = await requestPaymentRefund({
      paymentExternalId: settled.payment.externalId,
      actorId: user.id,
      reason: "Duplicate member payment",
      idempotencyKey: `refund-command-${marker}`,
    });
    expect(replay.refund.externalId).toBe(refund.refund.externalId);

    const [payment, wallet, receiptCount, refundCount, debitLedgerCount] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: settled.payment.id } }),
      prisma.wallet.findUniqueOrThrow({ where: { memberId: member.id } }),
      prisma.receipt.count({ where: { paymentId: settled.payment.id } }),
      prisma.paymentRefund.count({ where: { paymentId: settled.payment.id } }),
      prisma.foundationLedger.count({
        where: { relatedExternalId: refund.refund.externalId, direction: "DEBIT" },
      }),
    ]);
    expect(payment.status).toBe("SUCCEEDED");
    expect(wallet.balancePaise).toBe(36_900);
    expect(receiptCount).toBe(1);
    expect(refundCount).toBe(1);
    expect(debitLedgerCount).toBe(1);

    const cancellableDue = await prisma.due.create({
      data: {
        memberId: member.id,
        purpose: "MEMBERSHIP",
        amountPaise: 36_900,
        dueAt: new Date(Date.now() + 86_400_000),
      },
    });
    created.dueIds.push(cancellableDue.id);
    const pending = await createPaymentCommand({
      memberId: member.id,
      dueId: cancellableDue.id,
      method: "ONLINE",
      actorId: user.id,
      idempotencyKey: `cancel-command-${marker}`,
    });
    created.paymentIds.push(pending.id);
    const cancelled = await cancelPendingPayment({
      paymentExternalId: pending.externalId,
      memberId: member.id,
      actorId: user.id,
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(await prisma.due.findUniqueOrThrow({ where: { id: cancellableDue.id } })).toMatchObject({
      status: "PENDING",
    });
  }, 45_000);
});

afterAll(async () => {
  if (!runDatabaseTests || !created.userId) return;
  const wallet = created.memberId
    ? await prisma.wallet.findUnique({ where: { memberId: created.memberId } })
    : null;
  await prisma.auditLog.deleteMany({ where: { actorId: created.userId } });
  await prisma.foundationLedger.deleteMany({ where: { authorizedActorId: created.userId } });
  if (created.paymentIds.length)
    await prisma.receipt.deleteMany({ where: { paymentId: { in: created.paymentIds } } });
  if (created.paymentIds.length)
    await prisma.paymentRefund.deleteMany({ where: { paymentId: { in: created.paymentIds } } });
  if (wallet) {
    await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
    await prisma.wallet.delete({ where: { id: wallet.id } });
  }
  if (created.paymentIds.length)
    await prisma.payment.deleteMany({ where: { id: { in: created.paymentIds } } });
  if (created.dueIds.length) await prisma.due.deleteMany({ where: { id: { in: created.dueIds } } });
  if (created.memberId) await prisma.member.deleteMany({ where: { id: created.memberId } });
  await prisma.user.deleteMany({ where: { id: created.userId } });
});
