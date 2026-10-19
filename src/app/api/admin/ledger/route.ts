import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../server/http/authorize";
import { listFoundationLedger } from "../../../../server/payments/foundation-ledger-service";
import { cashRouteError } from "../../cash-route-response";
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    const query = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        purpose: z.string().max(200).optional(),
        direction: z.enum(["CREDIT", "DEBIT"]).optional(),
      })
      .parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json(await listFoundationLedger(query), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return cashRouteError(error);
  }
}
