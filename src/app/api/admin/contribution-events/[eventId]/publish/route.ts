import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { generateContributionDuesForApprovedEvent } from "../../../../../../server/contributions/contribution-generation-service";

/** Publishes an approved event and atomically creates its historical ₹100 obligations. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { eventId } = await params;
    const result = await generateContributionDuesForApprovedEvent({
      eventExternalId: eventId,
      actorId: principal.userId,
    });
    return NextResponse.json({
      eventExternalId: result.eventExternalId,
      publishedAt: result.publishedAt,
      dueAt: result.dueAt,
      createdCount: result.createdCount,
      dueExternalIds: result.dueExternalIds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request denied" },
      { status: 400 },
    );
  }
}
