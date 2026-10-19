import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { listCashReconciliation } from "../../../../server/coordinators/cash-reconciliation-service";
import { cashRouteError } from "../../cash-route-response";
export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    return NextResponse.json(await listCashReconciliation(principal.userId, true));
  } catch (error) {
    return cashRouteError(error);
  }
}
