import { NextRequest, NextResponse } from "next/server";
import { confirmDeathReportByCoordinator } from "../../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "coordinator:death:confirm");
    const { caseId } = await params;
    return NextResponse.json({
      report: await confirmDeathReportByCoordinator(caseId, principal.userId),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Death report confirmation denied" },
      { status: 400 },
    );
  }
}
