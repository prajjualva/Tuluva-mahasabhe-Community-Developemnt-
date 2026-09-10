import { NextRequest, NextResponse } from "next/server";
import { searchReportableMembers } from "../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../server/http/authorize";

/** Admin-only member search used to resolve a Member Not Found death report. */
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    const query = request.nextUrl.searchParams.get("query") ?? "";
    return NextResponse.json(
      { members: await searchReportableMembers(query) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Member search denied" },
      { status: 400 },
    );
  }
}
