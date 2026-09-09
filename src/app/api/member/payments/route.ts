import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { createPaymentCommand, memberIdForUser } from "../../../../server/payments/payment-service";
import { z } from "zod";
const bodySchema = z.object({
  dueId: z.string().uuid(),
  idempotencyKey: z.string().min(16),
  method: z.enum(["ONLINE", "WALLET", "CASH", "MANUAL"]),
});
export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const body = bodySchema.parse(await request.json());
    const memberId = await memberIdForUser(principal.userId);
    return NextResponse.json(
      await createPaymentCommand({
        memberId,
        dueId: body.dueId,
        method: body.method,
        idempotencyKey: body.idempotencyKey,
        actorId: principal.userId,
      }),
    );
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
