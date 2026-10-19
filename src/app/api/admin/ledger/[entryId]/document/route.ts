import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { downloadLedgerDocument } from "../../../../../../server/payments/foundation-ledger-service";
import { cashRouteError } from "../../../../cash-route-response";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { entryId } = await params;
    const document = await downloadLedgerDocument(principal.userId, entryId, false);
    return new NextResponse(document.bytes, {
      headers: {
        "content-type": document.contentType,
        "content-disposition": 'attachment; filename="foundation-ledger-document"',
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return cashRouteError(error);
  }
}
