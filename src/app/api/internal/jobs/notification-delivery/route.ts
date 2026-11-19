import { NextRequest, NextResponse } from "next/server";
import { deliverQueuedNotifications } from "../../../../../server/notifications/notification-delivery-service";
import { isAuthorizedInternalJob } from "../../../../../server/security/internal-job-auth";

export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalJob(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await deliverQueuedNotifications());
}

export const GET = POST;
export const maxDuration = 300;
export const dynamic = "force-dynamic";
