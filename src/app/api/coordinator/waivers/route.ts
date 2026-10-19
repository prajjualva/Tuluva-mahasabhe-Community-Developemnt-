import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { listDueWaivers, requestDueWaiver } from "../../../../server/membership/due-waiver-service";
import { communicationRouteError } from "../../communication-route-response";
export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "coordinator:members:manage");
    return NextResponse.json({ requests: await listDueWaivers(actor.userId, false) });
  } catch (error) {
    return communicationRouteError(error, "Waiver requests are unavailable");
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "coordinator:members:manage");
    return NextResponse.json(await requestDueWaiver(actor.userId, await request.json()));
  } catch (error) {
    return communicationRouteError(
      error,
      "Could not request waiver. Check assignment, unpaid due, and pending payments.",
    );
  }
}
