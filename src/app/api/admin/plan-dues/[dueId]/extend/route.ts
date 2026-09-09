import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { extendPlanDue } from "../../../../../../server/plans/plan-service";
const bodySchema = z.object({ dueAt: z.coerce.date(), reason: z.string().trim().min(3).max(1000) });
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dueId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { dueId } = await params;
    const body = bodySchema.parse(await request.json());
    const due = await extendPlanDue(dueId, principal.userId, body.dueAt, body.reason);
    return NextResponse.json({ externalId: due.externalId, dueAt: due.dueAt, status: due.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request denied" },
      { status: 400 },
    );
  }
}
