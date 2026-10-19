import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { queueOutstandingDueReminders } from "../../../../../server/notifications/due-reminder-service";

/** Protected scheduler entry point; it never accepts a member id from callers. */
export async function POST(request: NextRequest) {
  const secret = process.env.INTERNAL_JOB_SECRET;
  const supplied = request.headers.get("x-internal-job-secret");
  if (
    !secret ||
    !supplied ||
    secret.length !== supplied.length ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await queueOutstandingDueReminders());
}
