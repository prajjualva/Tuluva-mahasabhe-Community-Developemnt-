import { NextRequest, NextResponse } from "next/server";
import { listAdminDeathEventComments } from "../../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    await requireApiPermission(request, "admin:*");
    const { eventId } = await params;
    return NextResponse.json(
      { comments: await listAdminDeathEventComments(eventId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Comment queue denied" },
      { status: 403 },
    );
  }
}
