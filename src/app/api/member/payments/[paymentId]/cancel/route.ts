import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import {
  cancelPendingPayment,
  memberIdForUser,
} from "../../../../../../server/payments/payment-service";

/** Cancels only the signed-in member's pre-checkout ONLINE command. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "member:profile:write");
    const memberId = await memberIdForUser(principal.userId);
    const { paymentId } = await params;
    const payment = await cancelPendingPayment({
      paymentExternalId: paymentId,
      memberId,
      actorId: principal.userId,
    });
    return NextResponse.json({ externalId: payment.externalId, status: payment.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment could not be cancelled" },
      { status: 400 },
    );
  }
}
