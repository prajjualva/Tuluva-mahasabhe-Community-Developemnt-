import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../server/database/prisma";
import { requireApiPermission } from "../../../../server/http/authorize";

export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    const dues = await prisma.due.findMany({
      where: { purpose: "PLAN_REGISTRATION", status: { in: ["PENDING", "OVERDUE", "EXPIRED"] } },
      select: {
        externalId: true,
        dueAt: true,
        status: true,
        member: { select: { externalId: true, fullName: true } },
      },
      orderBy: { dueAt: "asc" },
    });
    return NextResponse.json(dues);
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
