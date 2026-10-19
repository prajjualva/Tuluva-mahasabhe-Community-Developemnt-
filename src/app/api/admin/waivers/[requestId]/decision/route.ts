import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { decideDueWaiver } from "../../../../../../server/membership/due-waiver-service";
import { communicationRouteError } from "../../../../communication-route-response";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const actor = await requireApiPermission(request, "admin:*");
    return NextResponse.json(
      await decideDueWaiver(actor.userId, (await context.params).requestId, await request.json()),
    );
  } catch (error) {
    return communicationRouteError(
      error,
      "Could not decide waiver. Check pending payment and due status.",
    );
  }
}
