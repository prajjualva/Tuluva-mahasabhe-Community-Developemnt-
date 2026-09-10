import { NextRequest, NextResponse } from "next/server";
import { listCoordinatorDeathReports } from "../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../server/http/authorize";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "coordinator:death:confirm");
    return NextResponse.json(
      { reports: await listCoordinatorDeathReports(principal.userId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Death report queue denied" }, { status: 403 });
  }
}
