import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { changeUserRole } from "../../../../../../server/admin/admin-command-service";
import { communicationRouteError } from "../../../../communication-route-response";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { userId } = await params;
    return NextResponse.json(await changeUserRole(principal.userId, userId, await request.json()));
  } catch (error) {
    return communicationRouteError(error, "Role assignment could not be changed");
  }
}
