import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../server/database/prisma";
import { requireApiPermission } from "../../../../server/http/authorize";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "coordinator:members:manage");
    const coordinator = await prisma.coordinator.findFirst({
      where: { member: { userId: principal.userId }, isSuspended: false, status: "ACTIVE" },
      select: { id: true },
    });
    if (!coordinator) throw new Error("Active Coordinator profile is required");
    const plans = await prisma.communitySupportPlan.findMany({
      where: { status: "PENDING_COORDINATOR_APPROVAL", member: { coordinatorId: coordinator.id } },
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
