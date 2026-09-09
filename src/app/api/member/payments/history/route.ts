import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { memberIdForUser } from "../../../../../server/payments/payment-service";
import { prisma } from "../../../../../server/database/prisma";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const memberId = await memberIdForUser(principal.userId);
    const payments = await prisma.payment.findMany({
      where: { memberId },
      select: {
        externalId: true,
        amountPaise: true,
        method: true,
        status: true,
        createdAt: true,
        receipt: { select: { receiptNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(payments);
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
