import { publicErrorMessage } from "../../../../../../server/http/public-error";
import { NextRequest, NextResponse } from "next/server";
import { listCoordinatorModerationComments } from "../../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "coordinator:members:manage");
    const { eventId } = await params;
    return NextResponse.json(
      { comments: await listCoordinatorModerationComments(eventId, principal.userId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Comment queue denied") },
      { status: 403 },
    );
  }
}
