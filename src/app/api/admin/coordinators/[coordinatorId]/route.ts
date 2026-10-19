import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { coordinatorOperationalDetail } from "../../../../../server/coordinators/coordinator-management-service";
import { communicationRouteError } from "../../../communication-route-response";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ coordinatorId: string }> },
) {
  try {
    await requireApiPermission(request, "admin:*");
    const { coordinatorId } = await params;
    return NextResponse.json(await coordinatorOperationalDetail(coordinatorId), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return communicationRouteError(error, "Coordinator history is unavailable");
  }
}
