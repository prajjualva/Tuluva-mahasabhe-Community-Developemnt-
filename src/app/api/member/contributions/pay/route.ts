import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../server/http/authorize";
import {
  memberIdForUser,
  createPaymentCommand,
} from "../../../../../server/payments/payment-service";
import { payDueFromWallet } from "../../../../../server/payments/wallet-service";
import { selectContributionDue } from "../../../../../server/payments/contribution-service";
import {
  createOnlineCheckout,
  onlinePaymentAvailability,
} from "../../../../../server/payments/online-payment-service";
import { PaymentProviderRequestError } from "../../../../../server/payments/payment-provider";
import { prisma } from "../../../../../server/database/prisma";

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
    // Resolve an idempotent replay before selecting an outstanding due: a
    // successful first request will already have marked that contribution PAID.
    const existing = await prisma.payment.findUnique({
      where: { idempotencyKey: body.idempotencyKey },
      select: {
        id: true,
        externalId: true,
        memberId: true,
        dueId: true,
        method: true,
        status: true,
        amountPaise: true,
        due: { select: { externalId: true, purpose: true } },
      },
    });
    if (existing) {
      if (
        existing.memberId !== memberId ||
        existing.method !== body.method ||
        existing.due?.purpose !== "CONTRIBUTION"
      )
        throw new Error("Idempotency key is already in use");
      if (existing.method === "ONLINE" && existing.status === "PENDING") {
        const checkout = await createOnlineCheckout({
          paymentId: existing.id,
          paymentExternalId: existing.externalId,
          amountPaise: existing.amountPaise,
          idempotencyKey: body.idempotencyKey,
          purpose: "CONTRIBUTION",
        });
        if (!checkout.available)
          return NextResponse.json(
            { error: "Online payments are not configured", code: "ONLINE_PAYMENT_UNAVAILABLE" },
            { status: 503 },
          );
        return NextResponse.json({
          externalId: existing.externalId,
          status: existing.status,
          dueExternalId: existing.due?.externalId,
          checkout: checkout.checkout,
        });
      }
      return NextResponse.json({
        externalId: existing.externalId,
        status: existing.status,
        dueExternalId: existing.due?.externalId,
      });
    }
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
    // Wallet-first applies to ₹100 contributions too. Unlike the ₹1,000 plan
    // registration, an ordinary contribution never consumes a partial wallet
    // balance: if it is insufficient, the online checkout is for the full due.
    const wallet = await prisma.wallet.findUnique({
      where: { memberId },
      select: { balancePaise: true },
    });
    if ((wallet?.balancePaise ?? 0) >= due.amountPaise) {
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
    const availability = onlinePaymentAvailability();
    if (!availability.available)
      return NextResponse.json(
        { error: "Online payments are not configured", code: "ONLINE_PAYMENT_UNAVAILABLE" },
        { status: 503 },
      );
    const payment = await createPaymentCommand({
      memberId,
      dueId: due.id,
      method: "ONLINE",
      idempotencyKey: body.idempotencyKey,
      actorId: principal.userId,
    });
    const checkout = await createOnlineCheckout({
      paymentId: payment.id,
      paymentExternalId: payment.externalId,
      amountPaise: payment.amountPaise,
      idempotencyKey: payment.idempotencyKey,
      purpose: "CONTRIBUTION",
    });
    if (!checkout.available)
      return NextResponse.json(
        { error: "Online payments are not configured", code: "ONLINE_PAYMENT_UNAVAILABLE" },
        { status: 503 },
      );
    return NextResponse.json({
      externalId: payment.externalId,
      status: payment.status,
      dueExternalId: due.externalId,
      checkout: checkout.checkout,
    });
  } catch (error) {
    if (error instanceof PaymentProviderRequestError)
      return NextResponse.json(
        { error: "The payment provider could not create a checkout order" },
        { status: 502 },
      );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request denied" },
      { status: 400 },
    );
  }
}
