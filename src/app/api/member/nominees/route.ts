import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import {
  listMemberNominees,
  submitNominee,
} from "../../../../server/members/nominee-persistence-service";
import { communicationRouteError } from "../../communication-route-response";
export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:read");
    return NextResponse.json(await listMemberNominees(actor.userId), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return communicationRouteError(error, "Nominee records are unavailable");
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:write");
    return NextResponse.json(await submitNominee(actor.userId, await request.json()));
  } catch (error) {
    return communicationRouteError(error, "Nominee submission could not be saved");
  }
}
