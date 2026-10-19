import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { readOwnProfile, updateOwnProfile } from "../../../../server/members/profile-service";
import { communicationRouteError } from "../../communication-route-response";
export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:read");
    return NextResponse.json(await readOwnProfile(actor.userId), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return communicationRouteError(error, "Profile is unavailable");
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:write");
    return NextResponse.json(await updateOwnProfile(actor.userId, await request.json()));
  } catch (error) {
    return communicationRouteError(error, "Profile could not be updated");
  }
}
