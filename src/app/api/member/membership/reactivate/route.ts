import { publicErrorMessage } from "../../../../../server/http/public-error";
import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { memberIdForUser } from "../../../../../server/payments/payment-service";
import { reactivateMembership } from "../../../../../server/membership/reactivation-service";
import { processMemberBilling } from "../../../../../server/membership/membership-lifecycle-service";

export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:write");
    const memberId = await memberIdForUser(principal.userId);
    await processMemberBilling(memberId);
    const member = await reactivateMembership(memberId, principal.userId);
    return NextResponse.json({ externalId: member.externalId, status: member.status });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Request denied") },
      { status: 400 },
    );
  }
}
