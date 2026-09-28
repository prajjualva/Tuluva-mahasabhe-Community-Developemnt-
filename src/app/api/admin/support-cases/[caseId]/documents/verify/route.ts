import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../../server/http/authorize";
import { verifySupportDocuments } from "../../../../../../../server/support/support-payment-service";
import { supportRouteError } from "../../../support-route-response";

const bodySchema = z.object({
  documentExternalIds: z.array(z.string().uuid()).min(1).max(50),
  reason: z.string().trim().min(3).max(1000),
});

/** Stores which restricted death evidence was reviewed without exposing its storage key or contents. */
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
      supportCase: await verifySupportDocuments({
        supportCaseExternalId: caseId,
        actorId: principal.userId,
        documentExternalIds: body.documentExternalIds,
        reason: body.reason,
      }),
    });
  } catch (error) {
    return supportRouteError(error, "Document verification denied");
  }
}
