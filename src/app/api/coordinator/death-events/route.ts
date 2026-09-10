import { NextRequest, NextResponse } from "next/server";
import { listCoordinatorPublishedDeathSupportEvents } from "../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../server/http/authorize";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "coordinator:members:manage");
    return NextResponse.json(
      { events: await listCoordinatorPublishedDeathSupportEvents(principal.userId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Death Support Event queue denied" }, { status: 403 });
  }
}
