import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { getAdminSupportCase } from "../../../../../server/support/support-payment-service";
import { supportRouteError } from "../support-route-response";

/** Returns a single safe review DTO; raw nominee bank details remain server-only. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    await requireApiPermission(request, "admin:*");
    const { caseId: untrustedCaseId } = await params;
    const caseId = z.string().uuid().parse(untrustedCaseId);
    return NextResponse.json(
      { supportCase: await getAdminSupportCase(caseId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return supportRouteError(error, "Support case denied");
  }
}
