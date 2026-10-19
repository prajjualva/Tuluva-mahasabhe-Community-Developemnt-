import { publicErrorMessage } from "../../../../../../server/http/public-error";
import { NextRequest, NextResponse } from "next/server";
import { cancelDeathSupportEvent } from "../../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { eventId } = await params;
    return NextResponse.json({
      result: await cancelDeathSupportEvent(eventId, principal.userId, await request.json()),
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Death Support Event cancellation denied") },
      { status: 400 },
    );
  }
}
