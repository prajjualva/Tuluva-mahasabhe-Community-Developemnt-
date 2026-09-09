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
        payment: { select: { amountPaise: true, method: true, status: true } },
      },
      orderBy: { issuedAt: "desc" },
    });
    return NextResponse.json(receipts);
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
