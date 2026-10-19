import { publicErrorMessage } from "../../../../../../server/http/public-error";
import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { publishDeathSupportEvent } from "../../../../../../server/death/death-workflow-service";

/** Publishes an approved event and atomically creates its historical ₹100 obligations. */
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
      { error: publicErrorMessage(error, "Request denied") },
      { status: 400 },
    );
  }
}
