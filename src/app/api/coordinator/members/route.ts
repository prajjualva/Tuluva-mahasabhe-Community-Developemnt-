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
    const members = await prisma.member.findMany({
      where: { coordinatorId: coordinator.id },
      select: {
        externalId: true,
        fullName: true,
        status: true,
        dues: {
          where: { status: { in: ["PENDING", "OVERDUE", "EXPIRED"] } },
          select: { externalId: true, purpose: true, amountPaise: true, dueAt: true, status: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { fullName: "asc" },
    });
    return NextResponse.json(members);
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
