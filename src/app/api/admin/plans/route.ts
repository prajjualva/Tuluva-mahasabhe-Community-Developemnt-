import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../server/database/prisma";
import { requireApiPermission } from "../../../../server/http/authorize";

export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    const plans = await prisma.communitySupportPlan.findMany({
      where: {
        OR: [
          { status: "PENDING_ADMIN_APPROVAL" },
          { status: "PENDING_COORDINATOR_APPROVAL", member: { coordinatorId: null } },
        ],
      },
      select: {
        externalId: true,
        createdAt: true,
        status: true,
        member: { select: { externalId: true, fullName: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(plans);
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
