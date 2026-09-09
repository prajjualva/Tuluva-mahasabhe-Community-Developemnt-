import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../server/database/prisma";
import { requireApiPermission } from "../../../../server/http/authorize";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) });
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid audit limit" }, { status: 400 });
  try {
    await requireApiPermission(request, "audit:read");
    const records = await prisma.auditLog.findMany({
      take: parsed.data.limit,
      orderBy: { createdAt: "desc" },
      select: {
        action: true,
        entityType: true,
        createdAt: true,
        reason: true,
        actorRole: true,
        actor: { select: { externalId: true } },
      },
    });
    return NextResponse.json(records, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
