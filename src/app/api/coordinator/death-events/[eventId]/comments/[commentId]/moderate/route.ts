import { NextRequest, NextResponse } from "next/server";
import { moderateDeathEventComment } from "../../../../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../../../../server/http/authorize";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; commentId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "coordinator:members:manage");
    const { eventId, commentId } = await params;
    const body = await request.json();
    return NextResponse.json({
      comment: await moderateDeathEventComment({
        eventExternalId: eventId,
        commentExternalId: commentId,
        actorId: principal.userId,
        role: "COORDINATOR",
        reason: body.reason,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Comment moderation denied" },
      { status: 400 },
    );
  }
}
