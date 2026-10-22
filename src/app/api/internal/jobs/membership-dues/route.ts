import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalJob } from "../../../../../server/security/internal-job-auth";
import { processMembershipLifecycle } from "../../../../../server/membership/membership-lifecycle-service";

export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalJob(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await processMembershipLifecycle());
}

export const GET = POST;
export const maxDuration = 300;
export const dynamic = "force-dynamic";
