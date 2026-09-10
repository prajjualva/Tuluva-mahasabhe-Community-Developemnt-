import { NextRequest, NextResponse } from "next/server";
import { getPublishedDeathSupportEvent } from "../../../../server/death/death-workflow-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    return NextResponse.json(
      { event: await getPublishedDeathSupportEvent(eventId) },
      {
        headers: { "Cache-Control": "public, max-age=60" },
      },
    );
  } catch {
    return NextResponse.json({ error: "Published Death Support Event not found" }, { status: 404 });
  }
}
