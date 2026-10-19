import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../server/http/authorize";
import { collectCashForDue } from "../../../../server/coordinators/cash-payment-service";
import { cashRouteError } from "../../cash-route-response";

const bodySchema = z.object({
  memberExternalId: z.string().uuid(),
  dueExternalId: z.string().uuid(),
  idempotencyKey: z.string().min(16).max(200),
  method: z.enum(["CASH", "MANUAL"]).default("CASH"),
});
export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "coordinator:cash:collect");
    const body = bodySchema.parse(await request.json());
    const payment = await collectCashForDue({ coordinatorUserId: principal.userId, ...body });
    return NextResponse.json({
      externalId: payment.externalId,
      status: payment.status,
      method: payment.method,
    });
  } catch (error) {
    return cashRouteError(error);
  }
}
