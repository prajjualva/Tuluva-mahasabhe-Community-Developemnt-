import { Prisma } from "@prisma/client";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";
import { assertDueSettlementAllowed } from "./payment-integrity";

export function capturedFundsCanSettleDue(
  due: { purpose: string; status: string; dueAt: Date },
  capturedAt: Date,
) {
  try {
    assertDueSettlementAllowed(due, capturedAt);
    return true;
  } catch {
    return false;
  }
}
export async function flagUnappliedFunds(
  tx: Prisma.TransactionClient,
  payment: { id: string; externalId: string; amountPaise: number },
  due: { externalId: string; status: string },
  actorId?: string,
) {
  await tx.auditLog.create({
    data: {
      actorId,
      actorRole: actorId ? undefined : "SYSTEM",
      action: "UNAPPLIED_PAYMENT_REQUIRES_REFUND_REVIEW",
      entityType: "Payment",
      entityId: payment.id,
      reason:
        "Verified received funds cannot be applied to the obligation's current state or deadline",
      afterState: {
        paymentExternalId: payment.externalId,
        dueExternalId: due.externalId,
        dueStatus: due.status,
        amountPaise: payment.amountPaise,
      },
    },
  });
  const admins = await tx.user.findMany({
    where: { status: "ACTIVE", roles: { some: { active: true, role: { code: "ADMIN" } } } },
    select: { id: true },
  });
  for (const admin of admins)
    await createInAppNotificationInTransaction(tx, {
      userId: admin.id,
      type: "SYSTEM",
      title: "Received payment requires refund review",
      body: "Verified funds were received for a no-longer-payable obligation. No due, membership or plan was activated. Review the payment in Admin payments.",
      relatedExternalId: payment.externalId,
      idempotencyKey: `unapplied-payment:${payment.id}:${admin.id}`,
    });
}
