import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { searchAdminUsers } from "../../../../server/admin/admin-query-service";
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    return NextResponse.json(
      await searchAdminUsers(Object.fromEntries(request.nextUrl.searchParams)),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Account records are unavailable or access is denied" },
      { status: 403 },
    );
  }
}
