import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import {
  listDeletionRequests,
  reviewDeletionRequest,
} from "../../../../server/members/account-deletion-service";
import { communicationRouteError } from "../../communication-route-response";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    return NextResponse.json(
      await listDeletionRequests(Object.fromEntries(request.nextUrl.searchParams)),
      { headers },
    );
  } catch (error) {
    return communicationRouteError(error, "Account deletion requests are unavailable");
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "admin:*");
    return NextResponse.json(await reviewDeletionRequest(actor.userId, await request.json()), {
      headers,
    });
  } catch (error) {
    return communicationRouteError(error, "The deletion review could not be saved");
  }
}
