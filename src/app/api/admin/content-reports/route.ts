import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import {
  listContentReports,
  reviewContentReport,
} from "../../../../server/community/content-safety";
import { communicationRouteError } from "../../communication-route-response";
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    return NextResponse.json(
      { reports: await listContentReports() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return communicationRouteError(error, "Content reports are unavailable");
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "admin:*");
    return NextResponse.json(await reviewContentReport(actor.userId, await request.json()));
  } catch (error) {
    return communicationRouteError(error, "Content report could not be reviewed");
  }
}
