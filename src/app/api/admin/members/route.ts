import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { searchAdminMembers } from "../../../../server/admin/admin-query-service";
import { communicationRouteError } from "../../communication-route-response";
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    return NextResponse.json(
      await searchAdminMembers(Object.fromEntries(request.nextUrl.searchParams)),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return communicationRouteError(error, "Member search could not be completed");
  }
}
