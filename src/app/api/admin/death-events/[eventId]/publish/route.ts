import { NextRequest, NextResponse } from "next/server";
import { publishDeathSupportEvent } from "../../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { eventId } = await params;
    const result = await publishDeathSupportEvent(eventId, principal.userId);
    return NextResponse.json({
      eventExternalId: result.eventExternalId,
      publishedAt: result.publishedAt,
      dueAt: result.dueAt,
      createdCount: result.createdCount,
      dueExternalIds: result.dueExternalIds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Death Support Event publication denied" },
      { status: 400 },
    );
  }
}
