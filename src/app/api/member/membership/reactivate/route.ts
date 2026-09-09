import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { memberIdForUser } from "../../../../../server/payments/payment-service";
import { reactivateMembership } from "../../../../../server/membership/reactivation-service";

export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:write");
    const memberId = await memberIdForUser(principal.userId);
    const member = await reactivateMembership(memberId, principal.userId);
    return NextResponse.json({ externalId: member.externalId, status: member.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request denied" },
      { status: 400 },
    );
  }
}
