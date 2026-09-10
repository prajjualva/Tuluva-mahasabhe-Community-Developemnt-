import { NextRequest, NextResponse } from "next/server";
import { closeDeathSupportEvent } from "../../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { eventId } = await params;
    const body = await request.json();
    return NextResponse.json({
      event: await closeDeathSupportEvent(eventId, principal.userId, body.reason),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Death Support Event closure denied" },
      { status: 400 },
    );
  }
}
