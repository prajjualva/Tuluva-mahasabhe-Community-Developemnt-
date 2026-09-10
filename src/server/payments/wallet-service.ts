import { assertPositiveMoney } from "../../domain/money";
import { advancePlanAfterRegistrationPayment } from "../plans/plan-service";
import {
  assertDuePayable,
  assertNoPendingPaymentForDue,
  officialReceiptNumber,
  runSerializablePaymentTransaction,
} from "./payment-integrity";

export async function applyFoundationWalletCredit(
  memberId: string,
  amountPaise: number,
  purpose: string,
  actorId: string,
  reason?: string,
) {
  assertPositiveMoney(amountPaise);
  return runSerializablePaymentTransaction(async (tx) => {
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
        reason: reason?.trim() || undefined,
        afterState: { amountPaise, purpose },
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
  return runSerializablePaymentTransaction(async (tx) => {
    const prior = await tx.payment.findUnique({
      where: { idempotencyKey },
      include: { receipt: true },
    });
    if (prior) {
      if (prior.memberId !== memberId || prior.dueId !== dueId || prior.method !== "WALLET")
        throw new Error("Idempotency key is already in use");
      return { payment: prior, entry: null, receipt: prior.receipt, alreadyProcessed: true };
    }
    const due = await tx.due.findUnique({ where: { id: dueId } });
    if (!due || due.memberId !== memberId) throw new Error("Due is not payable");
    assertDuePayable(due);
    await assertNoPendingPaymentForDue(tx, due.id, idempotencyKey);
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
        receiptNumber: officialReceiptNumber(payment.externalId),
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
  return runSerializablePaymentTransaction(async (tx) => {
    const existing = await tx.payment.findUnique({
      where: { idempotencyKey },
      include: { receipt: true },
    });
    if (existing) {
      if (
        existing.memberId !== memberId ||
        existing.dueId !== dueId ||
        !["ONLINE", "WALLET"].includes(existing.method)
      )
        throw new Error("Idempotency key is already in use");
      return {
        onlinePayment: existing,
        walletPayment: null,
        walletPaise: 0,
        alreadyProcessed: true,
      };
    }
    const due = await tx.due.findUnique({ where: { id: dueId } });
    if (!due || due.memberId !== memberId || due.purpose !== "PLAN_REGISTRATION")
      throw new Error("Plan registration due is not payable");
    assertDuePayable(due);
    // A provider-order retry can arrive with a fresh browser idempotency key.
    // Resume the single existing online leg rather than consuming wallet credit
    // again or leaving the member unable to reopen checkout.
    const pendingOnline = await tx.payment.findFirst({
      where: { memberId, dueId: due.id, method: "ONLINE", status: "PENDING" },
      include: { receipt: true },
    });
    if (pendingOnline) {
      const priorWalletLeg = await tx.payment.findUnique({
        where: { idempotencyKey: `${pendingOnline.idempotencyKey}:wallet` },
      });
      return {
        onlinePayment: pendingOnline,
        walletPayment: priorWalletLeg,
        walletPaise: priorWalletLeg?.amountPaise ?? 0,
        alreadyProcessed: true,
      };
    }
    await assertNoPendingPaymentForDue(tx, due.id, idempotencyKey);
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
          receiptNumber: officialReceiptNumber(payment.externalId),
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
          amountPaise: walletPaise,
          purpose: due.purpose,
          relatedExternalId: payment.externalId,
          authorizedActorId: actorId,
          status: "SUCCEEDED",
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
      await tx.receipt.create({
        data: {
          paymentId: walletPayment.id,
          receiptNumber: officialReceiptNumber(walletPayment.externalId),
        },
      });
      await tx.foundationLedger.create({
        data: {
          direction: "CREDIT",
          amountPaise: walletPaise,
          purpose: due.purpose,
          relatedExternalId: walletPayment.externalId,
          authorizedActorId: actorId,
          status: "SUCCEEDED",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "WALLET_PAYMENT_SETTLED",
          entityType: "Payment",
          entityId: walletPayment.id,
          afterState: { splitPlanPayment: true },
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
