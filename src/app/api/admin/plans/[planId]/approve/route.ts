import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { approvePlan } from "../../../../../../server/plans/plan-service";
import { z } from "zod";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { planId } = await params;
    z.string().uuid().parse(planId);
    const text = await request.text();
    const input = z
      .object({
        stage: z.enum(["ADMIN", "COORDINATOR"]).default("ADMIN"),
        reason: z.string().trim().min(3).max(1000).optional(),
      })
      .strict()
      .parse(text ? JSON.parse(text) : {});
    const plan = await approvePlan(planId, principal.userId, input.stage, input.reason);
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
