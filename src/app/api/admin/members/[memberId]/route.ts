import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { adminMemberDetail } from "../../../../../server/admin/admin-query-service";
import { communicationRouteError } from "../../../communication-route-response";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { memberId } = await params;
    return NextResponse.json(await adminMemberDetail(memberId, principal.userId), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return communicationRouteError(error, "Member profile could not be loaded");
  }
}
