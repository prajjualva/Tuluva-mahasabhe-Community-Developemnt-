import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { memberIdForUser } from "../../../../../server/payments/payment-service";
import { processMemberBilling } from "../../../../../server/membership/membership-lifecycle-service";
import { communicationRouteError } from "../../../communication-route-response";
export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:read");
    return NextResponse.json(await processMemberBilling(await memberIdForUser(actor.userId)));
  } catch (error) {
    return communicationRouteError(error, "Membership status could not be refreshed");
  }
}
