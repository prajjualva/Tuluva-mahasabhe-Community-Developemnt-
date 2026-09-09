import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { approvePlan } from "../../../../../../server/plans/plan-service";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { planId } = await params;
    const plan = await approvePlan(planId, principal.userId, "ADMIN");
    return NextResponse.json({
      externalId: plan.externalId,
      status: plan.status,
      activatedAt: plan.activatedAt,
      waitingEndsAt: plan.waitingEndsAt,
    });
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
