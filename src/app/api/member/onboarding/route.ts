import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { readOwnOnboarding } from "../../../../server/members/onboarding-service";
import { scheduleNotificationDelivery } from "../../../../server/notifications/notification-delivery-service";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:read");
    const state = await readOwnOnboarding(actor.userId);
    if (!state.paymentRequired && state.emailVerified)
      scheduleNotificationDelivery({ userId: actor.userId, limit: 10 });
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "Sign in to complete membership" }, { status: 403 });
  }
}
