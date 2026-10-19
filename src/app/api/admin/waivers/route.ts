import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { listDueWaivers } from "../../../../server/membership/due-waiver-service";
import { communicationRouteError } from "../../communication-route-response";
export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "admin:*");
    return NextResponse.json({ requests: await listDueWaivers(actor.userId, true) });
  } catch (error) {
    return communicationRouteError(error, "Waiver requests are unavailable");
  }
}
