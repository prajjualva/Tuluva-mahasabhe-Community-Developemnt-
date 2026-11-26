import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { reconcileOwnedOnlinePayment } from "../../../../../../server/payments/payment-reconciliation-service";
import { scheduleNotificationDelivery } from "../../../../../../server/notifications/notification-delivery-service";
import {
  consumeRateLimit,
  privateRateLimitKey,
} from "../../../../../../server/security/rate-limit";
import { ThrottleError } from "../../../../../../server/auth/login-throttle";
import { z } from "zod";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "member:profile:write");
    const { paymentId } = await params;
    z.uuid().parse(paymentId);
    await consumeRateLimit(
      privateRateLimitKey("verify-owned-payment", `${principal.userId}:${paymentId}`),
      12,
      60000,
    );
    const result = await reconcileOwnedOnlinePayment(principal.userId, paymentId, principal.userId);
    if (result.status === "SUCCEEDED")
      scheduleNotificationDelivery({ userId: principal.userId, limit: 10 });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          "Payment could not be confirmed. Check payment history before retrying; do not pay again if your bank was debited.",
      },
      { status: error instanceof ThrottleError ? 429 : 403 },
    );
  }
}
