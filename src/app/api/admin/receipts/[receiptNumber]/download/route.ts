import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { downloadAdministrativeReceipt } from "../../../../../../server/admin/admin-receipt-service";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ receiptNumber: string }> },
) {
  try {
    const actor = await requireApiPermission(request, "admin:*");
    const result = await downloadAdministrativeReceipt(
      actor.userId,
      (await context.params).receiptNumber,
    );
    return new NextResponse(result.html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `attachment; filename="${result.filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Receipt is unavailable or access is denied" },
      { status: 403 },
    );
  }
}
