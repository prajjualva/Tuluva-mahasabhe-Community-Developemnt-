import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/prisma";
import { SCHEME_DEFAULTS } from "../../domain/scheme-settings";
import { validateRemittanceAllocations } from "../../domain/cash-reconciliation";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";
import { verifyCashCollectionInTransaction } from "./cash-payment-service";
import { capturedFundsCanSettleDue } from "../payments/unapplied-payment-service";
import { readCashEvidence } from "./cash-evidence";

const submissionSchema = z
  .object({
    collectionExternalIds: z.array(z.string().uuid()).min(1).max(50),
    amountPaise: z.number().int().positive().max(2_147_483_647),
    bankReference: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .transform((value) => value.toUpperCase()),
    idempotencyKey: z.string().min(16).max(200),
  })
  .strict();
const decisionSchema = z
  .object({
    approved: z.boolean(),
    reason: z.string().trim().min(3).max(1000),
    allocations: z
      .array(
        z
          .object({
            collectionExternalId: z.string().uuid(),
            receivedAmountPaise: z.number().int().nonnegative().max(2_147_483_647),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const collectionSelect = {
  externalId: true,
  receiptNumber: true,
  amountPaise: true,
  status: true,
  createdAt: true,
  allocations: { select: { receivedAmountPaise: true, deposit: { select: { status: true } } } },
  discrepancy: {
    select: {
      externalId: true,
      amountPaise: true,
      status: true,
      deadlineAt: true,
      escalatedAt: true,
    },
  },
} satisfies Prisma.CashCollectionSelect;
const depositSelect = {
  externalId: true,
  bankReference: true,
  amountPaise: true,
  status: true,
  createdAt: true,
  verifiedAt: true,
  allocations: {
    select: {
      expectedAmountPaise: true,
      receivedAmountPaise: true,
      collection: { select: { externalId: true, receiptNumber: true } },
    },
  },
} satisfies Prisma.CashDepositSelect;

// Remitting one's own existing collections remains possible after suspension.
// This member-owned recovery service does not grant any Coordinator permissions or member access.
async function ownerCoordinator(tx: Prisma.TransactionClient, userId: string) {
  const coordinator = await tx.coordinator.findFirst({
    where: { member: { userId } },
    select: { id: true },
  });
  if (!coordinator) throw new Error("Collection account not found");
  return coordinator;
}

export async function listCashReconciliation(userId: string, admin = false) {
  const coordinator = admin ? null : await ownerCoordinator(prisma, userId);
  const where = coordinator ? { coordinatorId: coordinator.id } : {};
  const [collections, deposits] = await Promise.all([
    prisma.cashCollection.findMany({
      where,
      select: collectionSelect,
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.cashDeposit.findMany({
      where,
      select: depositSelect,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return {
    collections: collections.map(({ allocations, ...collection }) => ({
      ...collection,
      outstandingAmountPaise:
        collection.amountPaise -
        allocations
          .filter((item) => item.deposit.status === "VERIFIED")
          .reduce((sum, item) => sum + (item.receivedAmountPaise ?? 0), 0),
      awaitingDepositReview: allocations.some((item) => item.deposit.status === "PENDING"),
    })),
    deposits,
  };
}

export async function submitCashDeposit(userId: string, input: unknown, file: File) {
  const command = submissionSchema.parse(input);
  const ids = [...new Set(command.collectionExternalIds)].sort();
  if (ids.length !== command.collectionExternalIds.length)
    throw new Error("Duplicate collection selection");
  const evidence = await readCashEvidence(file);
  const commandHash = hash({ ...command, collectionExternalIds: ids, evidence: evidence.digest });
  return runSerializablePaymentTransaction(async (tx) => {
    const coordinator = await ownerCoordinator(tx, userId);
    const existing = await tx.cashDeposit.findUnique({
      where: { idempotencyKey: command.idempotencyKey },
    });
    if (existing) {
      if (existing.coordinatorId !== coordinator.id || existing.commandHash !== commandHash)
        throw new Error("Idempotency key is already in use");
      return tx.cashDeposit.findUniqueOrThrow({
        where: { id: existing.id },
        select: depositSelect,
      });
    }
    if (
      await tx.cashDeposit.findUnique({
        where: { bankReference: command.bankReference },
        select: { id: true },
      })
    )
      throw new Error("This bank reference has already been submitted");
    const collections = await tx.cashCollection.findMany({
      where: {
        externalId: { in: ids },
        coordinatorId: coordinator.id,
        status: { in: ["RECEIVED_BY_COORDINATOR", "PENDING_ADMIN_VERIFICATION"] },
      },
      select: { id: true, ...collectionSelect },
    });
    if (collections.length !== ids.length) throw new Error("Collection selection is unavailable");
    const allocations = collections.map((collection) => {
      if (collection.allocations.some((item) => item.deposit.status === "PENDING"))
        throw new Error("A selected collection already awaits deposit review");
      const verified = collection.allocations
        .filter((item) => item.deposit.status === "VERIFIED")
        .reduce((sum, item) => sum + (item.receivedAmountPaise ?? 0), 0);
      return {
        cashCollectionId: collection.id,
        expectedAmountPaise: collection.amountPaise - verified,
      };
    });
    const expected = allocations.reduce((sum, item) => sum + item.expectedAmountPaise, 0);
    if (command.amountPaise > expected || allocations.some((item) => item.expectedAmountPaise <= 0))
      throw new Error("Deposit exceeds the selected outstanding collections");
    const deposit = await tx.cashDeposit.create({
      data: {
        coordinatorId: coordinator.id,
        evidenceKey: randomUUID(),
        evidenceBytes: evidence.bytes,
        contentType: evidence.contentType,
        bankReference: command.bankReference,
        amountPaise: command.amountPaise,
        idempotencyKey: command.idempotencyKey,
        commandHash,
        allocations: { create: allocations },
      },
      select: depositSelect,
    });
    await tx.cashCollection.updateMany({
      where: { id: { in: collections.map((item) => item.id) } },
      data: { status: "PENDING_ADMIN_VERIFICATION" },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "CASH_DEPOSIT_SUBMITTED",
        entityType: "CashDeposit",
        entityId: deposit.externalId,
        afterState: { amountPaise: command.amountPaise, collectionExternalIds: ids },
      },
    });
    return deposit;
  });
}

export async function openCashDiscrepancy(
  tx: Prisma.TransactionClient,
  collectionId: string,
  amountPaise: number,
  reason: string,
  actorId: string | null,
) {
  const collection = await tx.cashCollection.findUniqueOrThrow({
    where: { id: collectionId },
    include: { coordinator: { include: { member: { select: { userId: true } } } } },
  });
  const prior = await tx.cashDiscrepancy.findUnique({ where: { cashCollectionId: collectionId } });
  if (prior?.status === "PAID") throw new Error("Resolved discrepancy cannot be reopened");
  const now = new Date();
  const version = await tx.schemeSettingVersion.findFirst({
    where: { setting: { key: "cashDiscrepancyResolutionDays" }, effectiveFrom: { lte: now } },
    orderBy: { effectiveFrom: "desc" },
    select: { value: true },
  });
  const days = version?.value ?? SCHEME_DEFAULTS.cashDiscrepancyResolutionDays;
  if (days !== 30) throw new Error("Cash discrepancy policy must allow 30 days");
  const discrepancy = await tx.cashDiscrepancy.upsert({
    where: { cashCollectionId: collectionId },
    create: {
      cashCollectionId: collectionId,
      amountPaise,
      reason,
      deadlineAt: new Date(now.getTime() + days * 86400000),
    },
    update: { amountPaise, reason },
  });
  await tx.auditLog.create({
    data: {
      actorId,
      action: "CASH_DISCREPANCY_RECORDED",
      entityType: "CashDiscrepancy",
      entityId: discrepancy.id,
      reason,
      afterState: { amountPaise, receiptNumber: collection.receiptNumber },
    },
  });
  await createInAppNotificationInTransaction(tx, {
    userId: collection.coordinator.member.userId,
    type: "CASH_DISCREPANCY",
    title: "Cash remittance shortfall",
    body: `Receipt ${collection.receiptNumber}: ₹${(amountPaise / 100).toFixed(2)} remains unverified. Resolve by ${discrepancy.deadlineAt.toISOString().slice(0, 10)}. New cash collection is blocked until resolved.`,
    relatedExternalId: discrepancy.externalId,
    idempotencyKey: `cash-shortfall:${discrepancy.id}:${amountPaise}`,
  });
  return discrepancy;
}

export async function verifyCashDeposit(adminUserId: string, externalId: string, input: unknown) {
  z.string().uuid().parse(externalId);
  const command = decisionSchema.parse(input);
  const decisions = [...command.allocations].sort((a, b) =>
    a.collectionExternalId.localeCompare(b.collectionExternalId),
  );
  const decisionHash = hash({ ...command, allocations: decisions });
  return runSerializablePaymentTransaction(async (tx) => {
    const deposit = await tx.cashDeposit.findUnique({
      where: { externalId },
      include: {
        allocations: { include: { collection: true } },
      },
    });
    if (!deposit || !deposit.evidenceBytes) throw new Error("Deposit evidence not found");
    if (deposit.status !== "PENDING") {
      if (deposit.decisionHash !== decisionHash)
        throw new Error("Deposit has already been reviewed");
      return tx.cashDeposit.findUniqueOrThrow({ where: { id: deposit.id }, select: depositSelect });
    }
    const map = new Map(
      decisions.map((item) => [item.collectionExternalId, item.receivedAmountPaise]),
    );
    if (
      map.size !== decisions.length ||
      map.size !== deposit.allocations.length ||
      deposit.allocations.some((item) => !map.has(item.collection.externalId))
    )
      throw new Error("Every deposit collection needs one allocation");
    const received = validateRemittanceAllocations(
      deposit.amountPaise,
      deposit.allocations.map((item) => ({
        expectedAmountPaise: item.expectedAmountPaise,
        receivedAmountPaise: map.get(item.collection.externalId)!,
      })),
    );
    if ((!command.approved && received !== 0) || (command.approved && received === 0))
      throw new Error(
        "Rejected deposits must allocate zero; verified deposits must allocate received money",
      );
    await tx.cashDeposit.update({
      where: { id: deposit.id },
      data: {
        status: command.approved ? "VERIFIED" : "REJECTED",
        verifiedBy: adminUserId,
        verifiedAt: new Date(),
        reason: command.reason,
        decisionHash,
      },
    });
    for (const item of deposit.allocations) {
      const amount = map.get(item.collection.externalId)!;
      await tx.cashDepositAllocation.update({
        where: { id: item.id },
        data: { receivedAmountPaise: amount },
      });
      if (amount > 0) {
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: item.collection.paymentId },
          include: { due: true },
        });
        await tx.foundationLedger.create({
          data: {
            direction: "CREDIT",
            amountPaise: amount,
            purpose: capturedFundsCanSettleDue(payment.due!, item.collection.createdAt)
              ? payment.due!.purpose
              : "UNAPPLIED_PAYMENT",
            relatedExternalId: payment.externalId,
            authorizedActorId: adminUserId,
            reference: deposit.externalId,
            supportingDepositId: deposit.id,
            status: "SUCCEEDED",
          },
        });
      }
      const remaining = item.expectedAmountPaise - amount;
      if (remaining === 0) {
        await verifyCashCollectionInTransaction(
          tx,
          item.collection.externalId,
          adminUserId,
          true,
          command.reason,
        );
        await tx.cashDiscrepancy.updateMany({
          where: { cashCollectionId: item.collection.id, status: "UNRESOLVED" },
          data: { status: "PAID", resolvedAt: new Date(), amountPaise: 0 },
        });
      } else {
        await openCashDiscrepancy(tx, item.collection.id, remaining, command.reason, adminUserId);
      }
    }
    await tx.auditLog.create({
      data: {
        actorId: adminUserId,
        action: command.approved ? "CASH_DEPOSIT_VERIFIED" : "CASH_DEPOSIT_REJECTED",
        entityType: "CashDeposit",
        entityId: deposit.id,
        reason: command.reason,
        afterState: { receivedAmountPaise: received, allocations: decisions },
      },
    });
    return tx.cashDeposit.findUniqueOrThrow({ where: { id: deposit.id }, select: depositSelect });
  });
}

export async function readCashDepositEvidence(userId: string, externalId: string, admin: boolean) {
  z.string().uuid().parse(externalId);
  return runSerializablePaymentTransaction(async (tx) => {
    const coordinator = admin ? null : await ownerCoordinator(tx, userId);
    const deposit = await tx.cashDeposit.findFirst({
      where: { externalId, ...(coordinator ? { coordinatorId: coordinator.id } : {}) },
      select: { id: true, evidenceBytes: true, contentType: true },
    });
    if (!deposit?.evidenceBytes || !deposit.contentType)
      throw new Error("Deposit evidence not found");
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "CASH_EVIDENCE_DOWNLOADED",
        entityType: "CashDeposit",
        entityId: deposit.id,
      },
    });
    return { bytes: deposit.evidenceBytes, contentType: deposit.contentType };
  });
}

/** Suspension immediately inventories every unsettled obligation without pretending money arrived. */
export async function reconcileSuspendedCoordinator(
  tx: Prisma.TransactionClient,
  coordinatorId: string,
  actorId: string | null,
) {
  const outstanding = await tx.cashCollection.findMany({
    where: {
      coordinatorId,
      status: { in: ["RECEIVED_BY_COORDINATOR", "PENDING_ADMIN_VERIFICATION"] },
    },
    include: { allocations: { where: { deposit: { status: "VERIFIED" } } }, discrepancy: true },
  });
  for (const item of outstanding) {
    if (item.discrepancy) continue;
    const remaining =
      item.amountPaise -
      item.allocations.reduce((sum, allocation) => sum + (allocation.receivedAmountPaise ?? 0), 0);
    if (remaining > 0)
      await openCashDiscrepancy(
        tx,
        item.id,
        remaining,
        "Outstanding cash reconciliation on Coordinator suspension",
        actorId,
      );
  }
}
