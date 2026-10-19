import { z } from "zod";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { officialReceiptHtml } from "../payments/receipt-document";
export async function downloadAdministrativeReceipt(actorId: string, receiptNumber: string) {
  z.string()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9_-]+$/)
    .parse(receiptNumber);
  return runSerializablePaymentTransaction(async (tx) => {
    if (
      !(await tx.userRole.count({
        where: {
          userId: actorId,
          active: true,
          role: { code: "ADMIN" },
          user: { status: "ACTIVE" },
        },
      }))
    )
      throw new Error("Forbidden");
    const receipt = await tx.receipt.findUnique({
      where: { receiptNumber },
      select: {
        receiptNumber: true,
        issuedAt: true,
        payment: {
          select: {
            id: true,
            externalId: true,
            amountPaise: true,
            method: true,
            status: true,
            providerReference: true,
            member: { select: { externalId: true, fullName: true } },
            due: { select: { externalId: true, purpose: true } },
            refund: { select: { status: true } },
          },
        },
      },
    });
    if (!receipt) throw new Error("Receipt not found");
    await tx.auditLog.create({
      data: {
        actorId,
        action: "ADMIN_RECEIPT_DOWNLOADED",
        entityType: "Payment",
        entityId: receipt.payment.id,
        reason: "Administrative financial record inspection",
        afterState: {
          paymentExternalId: receipt.payment.externalId,
          receiptNumber: receipt.receiptNumber,
        },
      },
    });
    return {
      filename: `${receipt.receiptNumber}.html`,
      html: officialReceiptHtml({
        receiptNumber: receipt.receiptNumber,
        issuedAt: receipt.issuedAt,
        amountPaise: receipt.payment.amountPaise,
        method: receipt.payment.method,
        status:
          receipt.payment.refund?.status === "SUCCEEDED" ? "REFUNDED" : receipt.payment.status,
        providerReference: receipt.payment.providerReference,
        paymentExternalId: receipt.payment.externalId,
        member: receipt.payment.member,
        due: receipt.payment.due,
      }),
    };
  });
}
