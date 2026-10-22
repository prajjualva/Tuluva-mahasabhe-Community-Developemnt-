import { isAuthorizedInternalJob } from "../../../../../server/security/internal-job-auth";
import { NextRequest, NextResponse } from "next/server";
import { escalateOverdueCashDiscrepancies } from "../../../../../server/coordinators/cash-discrepancy-job";
export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalJob(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await escalateOverdueCashDiscrepancies());
}

export const GET = POST;
export const maxDuration = 300;
export const dynamic = "force-dynamic";
