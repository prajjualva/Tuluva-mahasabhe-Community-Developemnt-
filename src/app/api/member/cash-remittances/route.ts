import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../server/http/authorize";
import {
  listCashReconciliation,
  submitCashDeposit,
} from "../../../../server/coordinators/cash-reconciliation-service";
import { parseRupeesToPaise } from "../../../../domain/cash-reconciliation";
import { cashRouteError } from "../../cash-route-response";
export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:cash:remit");
    return NextResponse.json(await listCashReconciliation(principal.userId));
  } catch (error) {
    return cashRouteError(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:cash:remit");
    const form = await request.formData();
    const command = z
      .object({
        collectionExternalIds: z.array(z.string().uuid()).min(1).max(50),
        amountRupees: z.string(),
        bankReference: z.string(),
        idempotencyKey: z.string(),
      })
      .strict()
      .parse(JSON.parse(String(form.get("command"))));
    const file = form.get("evidence");
    if (!(file instanceof File)) throw new Error("Upload a valid PDF, PNG or JPEG deposit receipt");
    const { amountRupees, ...rest } = command;
    return NextResponse.json(
      await submitCashDeposit(
        principal.userId,
        { ...rest, amountPaise: parseRupeesToPaise(amountRupees) },
        file,
      ),
    );
  } catch (error) {
    return cashRouteError(error);
  }
}
