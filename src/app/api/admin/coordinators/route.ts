import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { listCoordinatorsForAdmin } from "../../../../server/coordinators/coordinator-management-service";
import { communicationRouteError } from "../../communication-route-response";
import { createCoordinatorProfile } from "../../../../server/admin/admin-command-service";

export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    return NextResponse.json(
      { coordinators: await listCoordinatorsForAdmin() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return communicationRouteError(error, "Coordinator records are unavailable");
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    return NextResponse.json(
      await createCoordinatorProfile(principal.userId, await request.json()),
    );
  } catch (error) {
    return communicationRouteError(error, "Coordinator could not be appointed");
  }
}
