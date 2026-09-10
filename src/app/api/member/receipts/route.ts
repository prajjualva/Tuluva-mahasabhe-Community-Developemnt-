import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { memberIdForUser } from "../../../../server/payments/payment-service";
import { prisma } from "../../../../server/database/prisma";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const memberId = await memberIdForUser(principal.userId);
    const receipts = await prisma.receipt.findMany({
      where: { payment: { memberId } },
      select: {
        receiptNumber: true,
        issuedAt: true,
        payment: {
          select: {
            amountPaise: true,
            method: true,
            status: true,
            refund: { select: { status: true } },
          },
        },
      },
      orderBy: { issuedAt: "desc" },
    });
    return NextResponse.json(
      receipts.map((receipt) => ({
        receiptNumber: receipt.receiptNumber,
        issuedAt: receipt.issuedAt,
        payment: {
          amountPaise: receipt.payment.amountPaise,
          method: receipt.payment.method,
          status:
            receipt.payment.refund?.status === "SUCCEEDED" ? "REFUNDED" : receipt.payment.status,
        },
      })),
    );
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
