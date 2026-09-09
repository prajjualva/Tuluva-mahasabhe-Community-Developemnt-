import { createHash } from "node:crypto";
import { prisma } from "../database/prisma";

type PaymentDb = {
  member: { findUnique(args: unknown): Promise<{ id: string } | null> };
  due: {
    findUnique(
      args: unknown,
    ): Promise<{ id: string; memberId: string; amountPaise: number; status: string } | null>;
    update(args: unknown): Promise<unknown>;
  };
  payment: {
    findUnique(
      args: unknown,
    ): Promise<{ id: string; status: string; receipt?: { receiptNumber: string } | null } | null>;
    create(args: unknown): Promise<{ id: string; status: string }>;
    update(args: unknown): Promise<{ id: string; dueId: string | null; status: string }>;
  };
  receipt: { create(args: unknown): Promise<{ receiptNumber: string }> };
  auditLog: { create(args: unknown): Promise<unknown> };
};
type TransactionDb = PaymentDb & {
  $transaction<T>(work: (tx: PaymentDb) => Promise<T>): Promise<T>;
};
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const db = prisma as unknown as TransactionDb;

export async function memberIdForUser(userId: string) {
  const member = await db.member.findUnique({ where: { userId } });
  if (!member) throw new Error("Member account is required");
  return member.id;
}

/** Server-side command: never accepts an amount selected by the browser. */
export async function createPaymentCommand(input: {
  memberId: string;
  dueId: string;
  method: "ONLINE" | "WALLET" | "CASH" | "MANUAL";
  idempotencyKey: string;
  actorId: string;
}) {
  return db.$transaction(async (tx) => {
    const due = await tx.due.findUnique({ where: { id: input.dueId } });
    if (
      !due ||
      due.memberId !== input.memberId ||
      !["PENDING", "OVERDUE", "EXPIRED"].includes(due.status)
    )
      throw new Error("Due is not payable");
    const existing = await tx.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { receipt: true },
    });
    if (existing) return existing;
    const payment = await tx.payment.create({
      data: {
        memberId: input.memberId,
        dueId: input.dueId,
        amountPaise: due.amountPaise,
        method: input.method,
        idempotencyKey: input.idempotencyKey,
        status: "PENDING",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "PAYMENT_INITIATED",
        entityType: "Payment",
        entityId: payment.id,
      },
    });
    return payment;
  });
}

export async function recordWebhook(provider: string, eventId: string, payload: unknown) {
  return (
    db as unknown as { paymentWebhook: { upsert(args: unknown): Promise<unknown> } }
  ).paymentWebhook.upsert({
    where: { provider_providerEventId: { provider, providerEventId: eventId } },
    update: {},
    create: { provider, providerEventId: eventId, payload },
  });
}

export async function settlePayment(paymentId: string, actorId: string, providerReference: string) {
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.update({
      where: { id: paymentId, status: "PENDING" },
      data: { status: "SUCCEEDED", providerReference },
    });
    if (payment.dueId)
      await tx.due.update({
        where: { id: payment.dueId },
        data: { status: "PAID", paidAt: new Date() },
      });
    const receipt = await tx.receipt.create({
      data: {
        paymentId,
        receiptNumber: `RCP-${new Date().getUTCFullYear()}-${paymentId.slice(0, 8).toUpperCase()}`,
      },
    });
    await tx.auditLog.create({
      data: { actorId, action: "PAYMENT_SETTLED", entityType: "Payment", entityId: payment.id },
    });
    return { payment, receipt };
  });
}
export const opaquePaymentReference = (reference: string) => tokenHash(reference);
