import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { memberIdForUser } from "../../../../../server/payments/payment-service";
import { prisma } from "../../../../../server/database/prisma";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const memberId = await memberIdForUser(principal.userId);
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      select: { externalId: true, status: true, joinedAt: true },
    });
    return NextResponse.json(member);
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
