import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { memberIdForUser } from "../../../../../server/payments/payment-service";
import { prisma } from "../../../../../server/database/prisma";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const memberId = await memberIdForUser(principal.userId);
    const plan = await prisma.communitySupportPlan.findFirst({
      where: { memberId },
      orderBy: { activatedAt: "desc" },
      select: {
        externalId: true,
        status: true,
        activatedAt: true,
        waitingEndsAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json(plan ?? { status: "NOT_REGISTERED" });
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
