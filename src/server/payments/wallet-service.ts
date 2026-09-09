import { prisma } from "../database/prisma";
import { assertPositiveMoney } from "../../domain/money";
import { advancePlanAfterRegistrationPayment } from "../plans/plan-service";

export async function applyFoundationWalletCredit(
  memberId: string,
  amountPaise: number,
  purpose: string,
  actorId: string,
) {
  assertPositiveMoney(amountPaise);
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { memberId },
      update: {},
      create: { memberId },
    });
    const changed = await tx.wallet.updateMany({
      where: { id: wallet.id, version: wallet.version },
      data: { balancePaise: { increment: amountPaise }, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new Error("Wallet balance changed; retry credit");
    const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    const entry = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        direction: "CREDIT",
        amountPaise,
        balanceAfterPaise: updated.balancePaise,
        purpose,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "WALLET_CREDIT",
        entityType: "WalletTransaction",
        entityId: entry.id,
      },
    });
    await tx.foundationLedger.create({
      data: {
        direction: "CREDIT",
        amountPaise,
        purpose: `WALLET_${purpose}`,
        relatedExternalId: entry.relatedExternalId,
        authorizedActorId: actorId,
        status: "SUCCEEDED",
      },
    });
    return entry;
  });
}

export async function payDueFromWallet(
  memberId: string,
  dueId: string,
  actorId: string,
  idempotencyKey: string,
) {
  return prisma.$transaction(async (tx) => {
    const due = await tx.due.findUnique({ where: { id: dueId } });
    if (
      !due ||
      due.memberId !== memberId ||
      !["PENDING", "OVERDUE", "EXPIRED"].includes(due.status)
    )
      throw new Error("Due is not payable");
    const prior = await tx.payment.findUnique({
      where: { idempotencyKey },
      include: { receipt: true },
    });
    if (prior) {
      if (prior.memberId !== memberId || prior.dueId !== due.id)
        throw new Error("Idempotency key is already in use");
      return { payment: prior, entry: null, receipt: prior.receipt, alreadyProcessed: true };
    }
    const wallet = await tx.wallet.findUnique({ where: { memberId } });
    if (!wallet || wallet.balancePaise < due.amountPaise)
      throw new Error("Insufficient wallet balance");
    const changed = await tx.wallet.updateMany({
      where: { id: wallet.id, version: wallet.version, balancePaise: { gte: due.amountPaise } },
      data: { balancePaise: { decrement: due.amountPaise }, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new Error("Wallet balance changed; retry payment");
    const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    const payment = await tx.payment.create({
      data: {
        memberId,
        dueId,
        amountPaise: due.amountPaise,
        method: "WALLET",
        status: "SUCCEEDED",
        idempotencyKey,
      },
    });
    const entry = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        direction: "DEBIT",
        amountPaise: due.amountPaise,
        balanceAfterPaise: updated.balancePaise,
        purpose: due.purpose,
        relatedExternalId: payment.externalId,
      },
    });
    await tx.due.update({ where: { id: dueId }, data: { status: "PAID", paidAt: new Date() } });
    if (due.purpose === "PLAN_REGISTRATION" && due.planId)
      await advancePlanAfterRegistrationPayment(tx, due.planId);
    const receipt = await tx.receipt.create({
      data: {
        paymentId: payment.id,
        receiptNumber: `RCP-${new Date().getUTCFullYear()}-${payment.id.slice(0, 8).toUpperCase()}`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "WALLET_PAYMENT_SETTLED",
        entityType: "Payment",
        entityId: payment.id,
      },
    });
    await tx.foundationLedger.create({
      data: {
        direction: "CREDIT",
        amountPaise: due.amountPaise,
        purpose: due.purpose,
        relatedExternalId: payment.externalId,
        authorizedActorId: actorId,
        status: "SUCCEEDED",
      },
    });
    return { payment, entry, receipt, alreadyProcessed: false };
  });
}

/**
 * The ₹1,000 registration is the sole partial-wallet flow: any wallet balance is
 * consumed first and a real provider payment command is created only for the remainder.
 */
export async function startPlanWalletFirstSplitPayment(
  memberId: string,
  dueId: string,
  actorId: string,
  idempotencyKey: string,
) {
  return prisma.$transaction(async (tx) => {
    const due = await tx.due.findUnique({ where: { id: dueId } });
    if (
      !due ||
      due.memberId !== memberId ||
      due.purpose !== "PLAN_REGISTRATION" ||
      due.status !== "PENDING"
    )
      throw new Error("Plan registration due is not payable");
    const existing = await tx.payment.findUnique({
      where: { idempotencyKey },
      include: { receipt: true },
    });
    if (existing)
      return {
        onlinePayment: existing,
        walletPayment: null,
        walletPaise: 0,
        alreadyProcessed: true,
      };
    const wallet = await tx.wallet.findUnique({ where: { memberId } });
    const walletPaise = Math.min(wallet?.balancePaise ?? 0, due.amountPaise);
    if (walletPaise === due.amountPaise && wallet) {
      const changed = await tx.wallet.updateMany({
        where: { id: wallet.id, version: wallet.version, balancePaise: { gte: walletPaise } },
        data: { balancePaise: { decrement: walletPaise }, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("Wallet balance changed; retry payment");
      const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      const payment = await tx.payment.create({
        data: {
          memberId,
          dueId,
          amountPaise: walletPaise,
          method: "WALLET",
          status: "SUCCEEDED",
          idempotencyKey,
        },
      });
      const entry = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          direction: "DEBIT",
          amountPaise: walletPaise,
          balanceAfterPaise: updated.balancePaise,
          purpose: due.purpose,
          relatedExternalId: payment.externalId,
        },
      });
      await tx.due.update({ where: { id: due.id }, data: { status: "PAID", paidAt: new Date() } });
      if (due.planId) await advancePlanAfterRegistrationPayment(tx, due.planId);
      const receipt = await tx.receipt.create({
        data: {
          paymentId: payment.id,
          receiptNumber: `RCP-${new Date().getUTCFullYear()}-${payment.externalId.replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "WALLET_PAYMENT_SETTLED",
          entityType: "Payment",
          entityId: payment.id,
        },
      });
      return {
        onlinePayment: payment,
        walletPayment: payment,
        walletPaise,
        entry,
        receipt,
        alreadyProcessed: false,
      };
    }
    let walletPayment = null;
    if (wallet && walletPaise > 0) {
      const changed = await tx.wallet.updateMany({
        where: { id: wallet.id, version: wallet.version, balancePaise: { gte: walletPaise } },
        data: { balancePaise: { decrement: walletPaise }, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("Wallet balance changed; retry payment");
      const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      walletPayment = await tx.payment.create({
        data: {
          memberId,
          dueId,
          amountPaise: walletPaise,
          method: "WALLET",
          status: "SUCCEEDED",
          idempotencyKey: `${idempotencyKey}:wallet`,
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          direction: "DEBIT",
          amountPaise: walletPaise,
          balanceAfterPaise: updated.balancePaise,
          purpose: "PLAN_REGISTRATION",
          relatedExternalId: walletPayment.externalId,
        },
      });
    }
    const onlinePayment = await tx.payment.create({
      data: {
        memberId,
        dueId,
        amountPaise: due.amountPaise - walletPaise,
        method: "ONLINE",
        status: "PENDING",
        idempotencyKey,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "PLAN_SPLIT_PAYMENT_INITIATED",
        entityType: "Payment",
        entityId: onlinePayment.id,
        afterState: { walletPaise, onlinePaise: onlinePayment.amountPaise },
      },
    });
    return { onlinePayment, walletPayment, walletPaise, alreadyProcessed: false };
  });
}
