import { prisma } from "../database/prisma";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { suspendCoordinatorInTransaction } from "./coordinator-management-service";

export async function escalateOverdueCashDiscrepancies(now = new Date()) {
  const candidates = await prisma.cashDiscrepancy.findMany({
    where: { status: "UNRESOLVED", deadlineAt: { lte: now }, escalatedAt: null },
    select: { id: true },
    take: 100,
  });
  let escalated = 0;
  for (const candidate of candidates) {
    escalated += await escalateCashDiscrepancy(candidate.id, now);
  }
  return { escalated };
}

export async function escalateCashDiscrepancy(discrepancyId: string, now = new Date()) {
  return runSerializablePaymentTransaction(async (tx) => {
    const discrepancy = await tx.cashDiscrepancy.findFirst({
      where: {
        id: discrepancyId,
        status: "UNRESOLVED",
        deadlineAt: { lte: now },
        escalatedAt: null,
      },
      include: { collection: { include: { coordinator: true } } },
    });
    if (!discrepancy) return 0;
    const coordinator = discrepancy.collection.coordinator;
    if (!coordinator.isSuspended)
      await suspendCoordinatorInTransaction(tx, {
        actorId: null,
        coordinatorExternalId: coordinator.externalId,
        reason:
          "Scheduled cash reconciliation: discrepancy unresolved after 30 days; Admin investigation required",
        mode: "FOUNDATION_ADMIN",
      });
    await tx.cashDiscrepancy.update({
      where: { id: discrepancy.id },
      data: { escalatedAt: now },
    });
    await tx.auditLog.create({
      data: {
        action: "CASH_DISCREPANCY_ESCALATED_FOR_INVESTIGATION",
        entityType: "CashDiscrepancy",
        entityId: discrepancy.id,
        reason: "30-day resolution deadline elapsed",
        afterState: {
          coordinatorExternalId: coordinator.externalId,
          amountPaise: discrepancy.amountPaise,
          receiptNumber: discrepancy.collection.receiptNumber,
          systemJob: "cash-reconciliation",
        },
      },
    });
    return 1;
  });
}
