import { NextRequest, NextResponse } from "next/server";
import { searchAuditLog } from "../../../../server/audit/audit-query-service";
import { requireApiPermission } from "../../../../server/http/authorize";

export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "audit:read");
    return NextResponse.json(
      await searchAuditLog(Object.fromEntries(request.nextUrl.searchParams)),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
