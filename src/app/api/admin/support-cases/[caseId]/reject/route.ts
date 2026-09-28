import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { rejectSupportCase } from "../../../../../../server/support/support-payment-service";
import { supportRouteError } from "../../support-route-response";

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

/** A normal eligibility result never removes the Admin's recorded final decision. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { caseId: untrustedCaseId } = await params;
    const caseId = z.string().uuid().parse(untrustedCaseId);
    const body = bodySchema.parse(await request.json());
    return NextResponse.json({
      supportCase: await rejectSupportCase({
        supportCaseExternalId: caseId,
        actorId: principal.userId,
        reason: body.reason,
      }),
    });
  } catch (error) {
    return supportRouteError(error, "Support-case rejection denied");
  }
}
