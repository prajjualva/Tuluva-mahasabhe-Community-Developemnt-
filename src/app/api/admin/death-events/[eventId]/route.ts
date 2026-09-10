import { NextRequest, NextResponse } from "next/server";
import { editPublishedDeathSupportEvent } from "../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../server/http/authorize";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { eventId } = await params;
    return NextResponse.json({
      event: await editPublishedDeathSupportEvent(eventId, principal.userId, await request.json()),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Death Support Event edit denied" },
      { status: 400 },
    );
  }
}
