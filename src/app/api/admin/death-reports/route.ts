import { NextRequest, NextResponse } from "next/server";
import { listAdminDeathReports } from "../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../server/http/authorize";

const CASE_STATUSES = new Set([
  "REPORTED",
  "COORDINATOR_CONFIRMED",
  "ADMIN_VERIFICATION",
  "APPROVED",
  "REJECTED",
  "SUPPORT_PAYMENT_PENDING",
  "PAID",
  "CLOSED",
  "CANCELLED",
]);

export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    const requestedStatus = request.nextUrl.searchParams.get("status") ?? undefined;
    if (requestedStatus && !CASE_STATUSES.has(requestedStatus))
      throw new Error("Invalid death report status");
    return NextResponse.json(
      { reports: await listAdminDeathReports(requestedStatus as never) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Death report queue denied" },
      { status: 403 },
    );
  }
}
