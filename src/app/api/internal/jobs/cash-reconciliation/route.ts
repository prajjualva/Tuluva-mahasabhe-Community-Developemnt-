import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { escalateOverdueCashDiscrepancies } from "../../../../../server/coordinators/cash-discrepancy-job";
export async function POST(request: NextRequest) {
  const secret = Buffer.from(process.env.INTERNAL_JOB_SECRET ?? "");
  const supplied = Buffer.from(request.headers.get("x-internal-job-secret") ?? "");
  if (!secret.length || secret.length !== supplied.length || !timingSafeEqual(secret, supplied))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await escalateOverdueCashDiscrepancies());
}
