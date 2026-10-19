import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import {
  listActiveCoordinatorChoices,
  changeOwnCoordinator,
} from "../../../../server/members/profile-service";
import { communicationRouteError } from "../../communication-route-response";
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "member:profile:read");
    return NextResponse.json(await listActiveCoordinatorChoices(), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return communicationRouteError(error, "Coordinator choices are unavailable");
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:write");
    return NextResponse.json(await changeOwnCoordinator(actor.userId, await request.json()));
  } catch (error) {
    return communicationRouteError(error, "Coordinator change could not be saved");
  }
}
