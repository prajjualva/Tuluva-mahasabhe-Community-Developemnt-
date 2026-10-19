import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../server/http/authorize";
import { requestOperationalAdjustment } from "../../../../server/payments/foundation-ledger-service";
import { parseRupeesToPaise } from "../../../../domain/cash-reconciliation";
import { cashRouteError } from "../../cash-route-response";
export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const form = await request.formData();
    const command = z
      .object({
        amountRupees: z.string(),
        purpose: z.string(),
        reference: z.string(),
        reason: z.string(),
        idempotencyKey: z.string(),
      })
      .strict()
      .parse(JSON.parse(String(form.get("command"))));
    const file = form.get("evidence");
    if (!(file instanceof File)) throw new Error("Upload a valid PDF, PNG or JPEG deposit receipt");
    const { amountRupees, ...rest } = command;
    return NextResponse.json(
      await requestOperationalAdjustment(
        principal.userId,
        { ...rest, amountPaise: parseRupeesToPaise(amountRupees) },
        file,
      ),
    );
  } catch (error) {
    return cashRouteError(error);
  }
}
