import { isAuthorizedInternalJob } from "../../../../../server/security/internal-job-auth";
import { NextRequest, NextResponse } from "next/server";
import { queueOutstandingDueReminders } from "../../../../../server/notifications/due-reminder-service";

/** Protected scheduler entry point; it never accepts a member id from callers. */
export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalJob(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await queueOutstandingDueReminders());
}

export const GET = POST;
export const maxDuration = 300;
export const dynamic = "force-dynamic";
