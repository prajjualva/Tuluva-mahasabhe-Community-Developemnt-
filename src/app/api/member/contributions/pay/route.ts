import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../server/http/authorize";
import {
  memberIdForUser,
  createPaymentCommand,
} from "../../../../../server/payments/payment-service";
import { payDueFromWallet } from "../../../../../server/payments/wallet-service";
import { selectContributionDue } from "../../../../../server/payments/contribution-service";

const bodySchema = z.object({
  eventExternalId: z.string().uuid().optional(),
  method: z.enum(["ONLINE", "WALLET"]),
  idempotencyKey: z.string().min(16).max(200),
});

/** Pays the oldest outstanding contribution by default; an event UUID enables a specific-event payment. */
export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:write");
    const body = bodySchema.parse(await request.json());
    const memberId = await memberIdForUser(principal.userId);
    const due = await selectContributionDue({ memberId, eventExternalId: body.eventExternalId });
    if (body.method === "WALLET") {
      const settled = await payDueFromWallet(
        memberId,
        due.id,
        principal.userId,
        body.idempotencyKey,
      );
      return NextResponse.json({
        externalId: settled.payment.externalId,
        status: settled.payment.status,
        dueExternalId: due.externalId,
      });
    }
    const payment = await createPaymentCommand({
      memberId,
      dueId: due.id,
      method: "ONLINE",
      idempotencyKey: body.idempotencyKey,
      actorId: principal.userId,
    });
    return NextResponse.json({
      externalId: payment.externalId,
      status: payment.status,
      dueExternalId: due.externalId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request denied" },
      { status: 400 },
    );
  }
}
