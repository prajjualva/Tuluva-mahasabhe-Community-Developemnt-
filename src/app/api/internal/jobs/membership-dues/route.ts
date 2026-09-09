import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processMembershipDueExpiry } from "../../../../../server/membership/due-expiry-service";

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
  return NextResponse.json(await processMembershipDueExpiry());
}
