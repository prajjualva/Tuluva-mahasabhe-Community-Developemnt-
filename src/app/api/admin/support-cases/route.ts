import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { listAdminSupportCases } from "../../../../server/support/support-payment-service";
import { supportRouteError } from "./support-route-response";

/** Safe Admin queue DTOs deliberately omit encrypted bank and document storage data. */
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    return NextResponse.json(await listAdminSupportCases(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return supportRouteError(error, "Support-case queue denied");
  }
}
