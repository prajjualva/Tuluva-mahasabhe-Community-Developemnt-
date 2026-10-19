import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { prisma } from "../../../../../../server/database/prisma";
import { createOnlineCheckout } from "../../../../../../server/payments/online-payment-service";
import { assertDuePayable } from "../../../../../../server/payments/payment-integrity";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ paymentId: string }> },
) {
  try {
    const actor = await requireApiPermission(request, "member:profile:write");
    const externalId = z
      .string()
      .uuid()
      .parse((await context.params).paymentId);
    const payment = await prisma.payment.findFirst({
      where: { externalId, member: { userId: actor.userId }, method: "ONLINE", status: "PENDING" },
      include: { due: true },
    });
    if (!payment?.due)
      return NextResponse.json({ error: "Pending payment not found" }, { status: 404 });
    assertDuePayable(payment.due);
    const result = await createOnlineCheckout({
      paymentId: payment.id,
      paymentExternalId: payment.externalId,
      amountPaise: payment.amountPaise,
      idempotencyKey: payment.idempotencyKey,
      purpose: payment.due.purpose,
    });
    if (!result.available)
      return NextResponse.json({ error: "Online payments are not configured" }, { status: 503 });
    return NextResponse.json({
      externalId: payment.externalId,
      method: "ONLINE",
      status: "PENDING",
      checkout: result.checkout,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Checkout could not be resumed. Check payment history before making another payment.",
      },
      { status: 400 },
    );
  }
}
