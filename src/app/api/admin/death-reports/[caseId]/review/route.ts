import { NextRequest, NextResponse } from "next/server";
import { reviewDeathReportByAdmin } from "../../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { caseId } = await params;
    return NextResponse.json({
      result: await reviewDeathReportByAdmin(caseId, principal.userId, await request.json()),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Death report review denied" },
      { status: 400 },
    );
  }
}
