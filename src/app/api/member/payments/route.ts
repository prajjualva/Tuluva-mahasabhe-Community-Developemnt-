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
import {
  createOnlineCheckout,
  onlinePaymentAvailability,
} from "../../../../server/payments/online-payment-service";
import { PaymentProviderRequestError } from "../../../../server/payments/payment-provider";
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
    if (body.method === "ONLINE") {
      const availability = onlinePaymentAvailability();
      if (!availability.available)
        return NextResponse.json(
          { error: "Online payments are not configured", code: "ONLINE_PAYMENT_UNAVAILABLE" },
          { status: 503 },
        );
    }
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
      if (split.onlinePayment.method === "WALLET")
        return NextResponse.json({
          externalId: split.onlinePayment.externalId,
          status: split.onlinePayment.status,
          method: split.onlinePayment.method,
          amountPaise: split.onlinePayment.amountPaise,
          walletPaise: split.walletPaise,
        });
      const checkout = await createOnlineCheckout({
        paymentId: split.onlinePayment.id,
        paymentExternalId: split.onlinePayment.externalId,
        amountPaise: split.onlinePayment.amountPaise,
        idempotencyKey: split.onlinePayment.idempotencyKey,
        purpose: due.purpose,
      });
      if (!checkout.available)
        return NextResponse.json(
          { error: "Online payments are not configured", code: "ONLINE_PAYMENT_UNAVAILABLE" },
          { status: 503 },
        );
      return NextResponse.json({
        externalId: split.onlinePayment.externalId,
        status: split.onlinePayment.status,
        method: split.onlinePayment.method,
        amountPaise: split.onlinePayment.amountPaise,
        walletPaise: split.walletPaise,
        checkout: checkout.checkout,
      });
    }
    const payment = await createPaymentCommand({
      memberId,
      dueId,
      method: body.method,
      idempotencyKey: body.idempotencyKey,
      actorId: principal.userId,
    });
    if (body.method === "ONLINE") {
      const checkout = await createOnlineCheckout({
        paymentId: payment.id,
        paymentExternalId: payment.externalId,
        amountPaise: payment.amountPaise,
        idempotencyKey: payment.idempotencyKey,
        purpose: due.purpose,
      });
      if (!checkout.available)
        return NextResponse.json(
          { error: "Online payments are not configured", code: "ONLINE_PAYMENT_UNAVAILABLE" },
          { status: 503 },
        );
      return NextResponse.json({
        externalId: payment.externalId,
        status: payment.status,
        method: payment.method,
        amountPaise: payment.amountPaise,
        checkout: checkout.checkout,
      });
    }
    return NextResponse.json({
      externalId: payment.externalId,
      status: payment.status,
      method: payment.method,
      amountPaise: payment.amountPaise,
    });
  } catch (error) {
    if (error instanceof PaymentProviderRequestError)
      return NextResponse.json(
        { error: "The payment provider could not create a checkout order" },
        { status: 502 },
      );
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
