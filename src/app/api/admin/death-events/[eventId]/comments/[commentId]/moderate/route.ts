import { publicErrorMessage } from "../../../../../../../../server/http/public-error";
import { NextRequest, NextResponse } from "next/server";
import { moderateDeathEventComment } from "../../../../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../../../../server/http/authorize";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; commentId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { eventId, commentId } = await params;
    const body = await request.json();
    return NextResponse.json({
      comment: await moderateDeathEventComment({
        eventExternalId: eventId,
        commentExternalId: commentId,
        actorId: principal.userId,
        role: "ADMIN",
        reason: body.reason,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Comment moderation denied") },
      { status: 400 },
    );
  }
}
