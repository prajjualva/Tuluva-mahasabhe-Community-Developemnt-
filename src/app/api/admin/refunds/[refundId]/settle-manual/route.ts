import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { settleManualPaymentRefund } from "../../../../../../server/payments/payment-refund-service";

const bodySchema = z.object({ reference: z.string().trim().min(3).max(200) });

/** Records a cash/manual refund only after an Administrator has issued it externally. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ refundId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { refundId } = await params;
    const body = bodySchema.parse(await request.json());
    const refund = await settleManualPaymentRefund({
      refundExternalId: refundId,
      actorId: principal.userId,
      reference: body.reference,
    });
    return NextResponse.json({ externalId: refund.externalId, status: refund.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refund could not be recorded" },
      { status: 400 },
    );
  }
}
