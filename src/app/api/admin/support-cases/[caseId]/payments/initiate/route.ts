import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../../server/http/authorize";
import { initiateSupportPayment } from "../../../../../../../server/support/support-payment-service";
import { supportRouteError } from "../../../support-route-response";

const bodySchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(200),
});

/** Initiates one fixed payout attempt after final Admin approval; never fabricates a success. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { caseId: untrustedCaseId } = await params;
    const caseId = z.string().uuid().parse(untrustedCaseId);
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(
      await initiateSupportPayment({
        supportCaseExternalId: caseId,
        actorId: principal.userId,
        idempotencyKey: body.idempotencyKey,
      }),
      { status: 202 },
    );
  } catch (error) {
    return supportRouteError(error, "Support-payment initiation denied");
  }
}
