import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { readCashDepositEvidence } from "../../../../../../server/coordinators/cash-reconciliation-service";
import { cashRouteError } from "../../../../cash-route-response";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ depositId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { depositId } = await params;
    const evidence = await readCashDepositEvidence(principal.userId, depositId, true);
    return new NextResponse(new Uint8Array(evidence.bytes), {
      headers: {
        "content-type": evidence.contentType,
        "content-disposition": 'attachment; filename="remittance-evidence"',
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return cashRouteError(error);
  }
}
