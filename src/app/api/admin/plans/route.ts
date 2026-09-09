import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../server/database/prisma";
import { requireApiPermission } from "../../../../server/http/authorize";

export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    const plans = await prisma.communitySupportPlan.findMany({
      where: { status: "PENDING_ADMIN_APPROVAL" },
      select: {
        externalId: true,
        createdAt: true,
        member: { select: { externalId: true, fullName: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(plans);
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
