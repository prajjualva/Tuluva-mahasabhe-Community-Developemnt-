import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { prisma } from "../../../../../../server/database/prisma";
import { memberIdForUser } from "../../../../../../server/payments/payment-service";
import { officialReceiptHtml } from "../../../../../../server/payments/receipt-document";

/** Downloads a member-owned receipt only; the receipt number alone is never authority. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ receiptNumber: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const memberId = await memberIdForUser(principal.userId);
    const { receiptNumber } = await params;
    const receipt = await prisma.receipt.findFirst({
      where: { receiptNumber, payment: { memberId } },
      select: {
        receiptNumber: true,
        issuedAt: true,
        payment: {
          select: {
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
    if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

    const filename = `${receipt.receiptNumber.replaceAll(/[^A-Za-z0-9-]/g, "") || "receipt"}.html`;
    return new NextResponse(
      officialReceiptHtml({
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
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
          "x-content-type-options": "nosniff",
          "cache-control": "private, no-store",
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
