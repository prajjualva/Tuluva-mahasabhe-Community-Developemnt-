import { NextRequest, NextResponse } from "next/server";
import { listAdminDeathSupportEvents } from "../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../server/http/authorize";

export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    return NextResponse.json(
      { events: await listAdminDeathSupportEvents() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Death Support Event queue denied" }, { status: 403 });
  }
}
