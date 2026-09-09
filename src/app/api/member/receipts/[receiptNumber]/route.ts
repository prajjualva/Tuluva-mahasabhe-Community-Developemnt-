import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { memberIdForUser } from "../../../../../server/payments/payment-service";
import { prisma } from "../../../../../server/database/prisma";

/** An official receipt is always scoped through the signed-in member's payment. */
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
            due: { select: { externalId: true, purpose: true } },
          },
        },
      },
    });
    if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    return NextResponse.json(receipt);
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
