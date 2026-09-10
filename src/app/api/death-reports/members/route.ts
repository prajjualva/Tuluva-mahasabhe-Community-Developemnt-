import { NextRequest, NextResponse } from "next/server";
import {
  clientAddress,
  consumePublicDeathReportRequest,
  deathReportSearchThrottleKey,
  ThrottleError,
} from "../../../../server/auth/login-throttle";
import { searchReportableMembers } from "../../../../server/death/death-workflow-service";

/**
 * Anyone may perform the required member selection lookup, but the persistent
 * opaque IP bucket, minimum query, small result limit, and DTO allowlist make
 * this a report-intake endpoint rather than a member directory.
 */
export async function GET(request: NextRequest) {
  try {
    await consumePublicDeathReportRequest(
      deathReportSearchThrottleKey(clientAddress(request.headers)),
    );
    const query = request.nextUrl.searchParams.get("query") ?? "";
    return NextResponse.json(
      { members: await searchReportableMembers(query) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof ThrottleError)
      return NextResponse.json({ error: error.message }, { status: 429 });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Member search denied" },
      { status: 400 },
    );
  }
}
