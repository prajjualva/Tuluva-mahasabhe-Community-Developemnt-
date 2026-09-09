import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { memberIdForUser } from "../../../../server/payments/payment-service";
import { prisma } from "../../../../server/database/prisma";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const memberId = await memberIdForUser(principal.userId);
    const dues = await prisma.due.findMany({
      where: { memberId, status: { in: ["PENDING", "OVERDUE", "EXPIRED"] } },
      select: { externalId: true, purpose: true, amountPaise: true, dueAt: true, status: true },
      orderBy: [{ dueAt: "asc" }, { externalId: "asc" }],
    });
    return NextResponse.json(dues);
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
