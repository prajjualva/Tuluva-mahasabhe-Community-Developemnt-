import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import {
  requestPaymentRefund,
  refundPrismaError,
} from "../../../../../../server/payments/payment-refund-service";
import { PaymentProviderRequestError } from "../../../../../../server/payments/payment-provider";

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  idempotencyKey: z.string().min(16).max(200),
});

/** An Administrator starts one audited, full compensating refund per payment. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { paymentId } = await params;
    const body = bodySchema.parse(await request.json());
    const result = await requestPaymentRefund({
      paymentExternalId: paymentId,
      actorId: principal.userId,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json(
      {
        externalId: result.refund.externalId,
        status: result.refund.status,
        outcome: result.outcome,
      },
      { status: result.outcome === "PROVIDER_UNAVAILABLE" ? 202 : 200 },
    );
  } catch (error) {
    if (error instanceof PaymentProviderRequestError)
      return NextResponse.json(
        { error: "The payment provider could not create the refund" },
        { status: 502 },
      );
    if (refundPrismaError(error))
      return NextResponse.json(
        { error: "A refund already exists for this payment" },
        { status: 409 },
      );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refund request denied" },
      { status: 400 },
    );
  }
}
