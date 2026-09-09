import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../server/database/prisma";
import { requireApiPermission } from "../../../../server/http/authorize";

export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    const collections = await prisma.cashCollection.findMany({
      where: { status: "PENDING_ADMIN_VERIFICATION" },
      select: {
        externalId: true,
        amountPaise: true,
        receiptNumber: true,
        member: { select: { externalId: true, fullName: true } },
      },
      orderBy: { receiptNumber: "asc" },
    });
    return NextResponse.json(collections);
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
