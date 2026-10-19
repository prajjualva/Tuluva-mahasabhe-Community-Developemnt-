import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { adminDashboardSnapshot } from "../../../../server/admin/admin-query-service";
import { communicationRouteError } from "../../communication-route-response";
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    return NextResponse.json(await adminDashboardSnapshot(), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return communicationRouteError(error, "Dashboard could not be loaded");
  }
}
