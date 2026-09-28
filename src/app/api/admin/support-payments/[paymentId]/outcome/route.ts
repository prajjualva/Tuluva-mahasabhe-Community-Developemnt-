import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { recordSupportPaymentProviderOutcome } from "../../../../../../server/support/support-payment-service";
import { supportRouteError } from "../../../support-cases/support-route-response";

const bodySchema = z.object({
  providerReference: z.string().trim().min(3).max(200),
  outcome: z.enum(["SUCCEEDED", "FAILED"]),
});

/**
 * Records an outcome for a genuine external transfer. A real reference is mandatory;
 * this route is deliberately not a test or simulated-success endpoint.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { paymentId: untrustedPaymentId } = await params;
    const paymentId = z.string().uuid().parse(untrustedPaymentId);
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(
      await recordSupportPaymentProviderOutcome({
        supportPaymentExternalId: paymentId,
        actorId: principal.userId,
        providerReference: body.providerReference,
        outcome: body.outcome,
      }),
    );
  } catch (error) {
    return supportRouteError(error, "Support-payment outcome denied");
  }
}
