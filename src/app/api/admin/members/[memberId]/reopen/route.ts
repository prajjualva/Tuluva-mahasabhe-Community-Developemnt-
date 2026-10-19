import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { reopenClosedMembership } from "../../../../../../server/membership/membership-lifecycle-service";
import { communicationRouteError } from "../../../../communication-route-response";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  try {
    const actor = await requireApiPermission(request, "admin:*");
    const { memberId } = await params;
    return NextResponse.json(
      await reopenClosedMembership(actor.userId, memberId, await request.json()),
    );
  } catch (error) {
    return communicationRouteError(error, "Membership reopening could not be completed");
  }
}
