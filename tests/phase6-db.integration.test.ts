import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import { createPaymentCommand, settlePayment } from "../src/server/payments/payment-service";

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const databaseDescribe = runDatabaseTests ? describe : describe.skip;
const created = { userId: "", memberId: "", dueId: "", paymentId: "" };

databaseDescribe("Phase 6 Neon payment integration", () => {
  it("settles a server-calculated due and creates one official receipt", async () => {
    const marker = crypto.randomUUID();
    const user = await prisma.user.create({ data: { email: `phase6-${marker}@example.invalid` } });
    created.userId = user.id;
    const member = await prisma.member.create({
      data: { userId: user.id, fullName: "Phase 6 Integration", address: "Test-only record" },
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
    created.dueId = due.id;
    const payment = await createPaymentCommand({
      memberId: member.id,
      dueId: due.id,
      method: "ONLINE",
      idempotencyKey: `phase6-${marker}`,
      actorId: user.id,
    });
    created.paymentId = payment.id;
    const providerOrderId = `order-${marker}`;
    await prisma.payment.update({ where: { id: payment.id }, data: { providerOrderId } });
    const providerReference = `test-provider-${marker}`;
    const settled = await settlePayment(payment.id, user.id, providerReference);
    expect(settled.payment.status).toBe("SUCCEEDED");
    expect(settled.payment.providerOrderId).toBe(providerOrderId);
    expect(settled.payment.providerReference).toBe(providerReference);
    expect(settled.receipt).not.toBeNull();
    expect(settled.receipt?.receiptNumber).toMatch(/^RCP-\d{4}-/);
    expect((await settlePayment(payment.id, user.id, providerReference)).alreadySettled).toBe(true);
    const paidDue = await prisma.due.findUniqueOrThrow({
      where: { id: due.id },
      select: { status: true },
    });
    expect(paidDue.status).toBe("PAID");
  }, 30_000);
});

afterAll(async () => {
  if (!runDatabaseTests || !created.userId) return;
  await prisma.$transaction(async (tx) => {
    if (created.paymentId) await tx.receipt.deleteMany({ where: { paymentId: created.paymentId } });
    if (created.paymentId) await tx.payment.deleteMany({ where: { id: created.paymentId } });
    if (created.dueId) await tx.due.deleteMany({ where: { id: created.dueId } });
    await tx.auditLog.deleteMany({ where: { actorId: created.userId } });
    if (created.memberId) await tx.member.deleteMany({ where: { id: created.memberId } });
    await tx.user.deleteMany({ where: { id: created.userId } });
  });
  await prisma.$disconnect();
});
