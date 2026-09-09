import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import {
  createPaymentCommand,
  dueIdForMemberExternal,
  memberIdForUser,
} from "../../../../server/payments/payment-service";
import {
  payDueFromWallet,
  startPlanWalletFirstSplitPayment,
} from "../../../../server/payments/wallet-service";
import { prisma } from "../../../../server/database/prisma";
import { z } from "zod";
const bodySchema = z.object({
  dueId: z.string().uuid(),
  idempotencyKey: z.string().min(16),
  method: z.enum(["ONLINE", "WALLET", "CASH", "MANUAL"]),
});
export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:write");
    const body = bodySchema.parse(await request.json());
    const memberId = await memberIdForUser(principal.userId);
    const dueId = await dueIdForMemberExternal(memberId, body.dueId);
    if (body.method === "WALLET")
      return NextResponse.json(
        await payDueFromWallet(memberId, dueId, principal.userId, body.idempotencyKey),
      );
    const due = await prisma.due.findUniqueOrThrow({
      where: { id: dueId },
      select: { purpose: true },
    });
    if (body.method === "ONLINE" && due.purpose === "PLAN_REGISTRATION") {
      const split = await startPlanWalletFirstSplitPayment(
        memberId,
        dueId,
        principal.userId,
        body.idempotencyKey,
      );
      return NextResponse.json({
        externalId: split.onlinePayment.externalId,
        status: split.onlinePayment.status,
        method: split.onlinePayment.method,
        amountPaise: split.onlinePayment.amountPaise,
        walletPaise: split.walletPaise,
      });
    }
    const payment = await createPaymentCommand({
      memberId,
      dueId,
      method: body.method,
      idempotencyKey: body.idempotencyKey,
      actorId: principal.userId,
    });
    return NextResponse.json({
      externalId: payment.externalId,
      status: payment.status,
      method: payment.method,
      amountPaise: payment.amountPaise,
    });
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
