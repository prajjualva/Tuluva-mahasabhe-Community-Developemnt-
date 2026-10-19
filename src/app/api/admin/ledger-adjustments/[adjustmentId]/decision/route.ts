import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { decideOperationalAdjustment } from "../../../../../../server/payments/foundation-ledger-service";
import { cashRouteError } from "../../../../cash-route-response";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ adjustmentId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { adjustmentId } = await params;
    return NextResponse.json(
      await decideOperationalAdjustment(principal.userId, adjustmentId, await request.json()),
    );
  } catch (error) {
    return cashRouteError(error);
  }
}
