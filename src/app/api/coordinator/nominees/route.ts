import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { listNomineesForVerification } from "../../../../server/members/nominee-persistence-service";
import { communicationRouteError } from "../../communication-route-response";
export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "coordinator:members:manage");
    return NextResponse.json(await listNomineesForVerification(actor.userId, false), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return communicationRouteError(error, "Nominee verification records are unavailable");
  }
}
