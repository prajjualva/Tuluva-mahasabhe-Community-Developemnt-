import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { memberIdForUser } from "../../../../server/payments/payment-service";
import { startPlanRegistration } from "../../../../server/plans/plan-service";
export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:write");
    const memberId = await memberIdForUser(principal.userId);
    const { plan, due } = await startPlanRegistration(memberId, principal.userId);
    return NextResponse.json(
      {
        plan: { externalId: plan.externalId, status: plan.status, createdAt: plan.createdAt },
        due: {
          externalId: due.externalId,
          amountPaise: due.amountPaise,
          status: due.status,
          dueAt: due.dueAt,
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request denied" },
      { status: 400 },
    );
  }
}
