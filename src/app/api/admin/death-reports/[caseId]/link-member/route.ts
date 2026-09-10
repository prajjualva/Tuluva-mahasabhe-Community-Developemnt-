import { NextRequest, NextResponse } from "next/server";
import { linkUnmatchedDeathReportToMember } from "../../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { caseId } = await params;
    return NextResponse.json({
      report: await linkUnmatchedDeathReportToMember(
        caseId,
        principal.userId,
        await request.json(),
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Death report member link denied" },
      { status: 400 },
    );
  }
}
