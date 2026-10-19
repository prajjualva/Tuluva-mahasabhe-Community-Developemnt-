import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../server/database/prisma";
import { requireApiPermission } from "../../../../server/http/authorize";
import { Prisma } from "@prisma/client";
import { z } from "zod";

/** Administrator reconciliation view; all identifiers remain external UUIDs. */
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    const query = z
      .object({
        status: z.enum(["PENDING", "SUCCEEDED", "FAILED", "CANCELLED", "REFUNDED"]).optional(),
        search: z.string().trim().max(160).default(""),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .strict()
      .parse(Object.fromEntries(request.nextUrl.searchParams));
    const where: Prisma.PaymentWhereInput = {
      ...(query.status === "REFUNDED"
        ? { refund: { status: "SUCCEEDED" } }
        : query.status
          ? { status: query.status }
          : {}),
      ...(query.status === "SUCCEEDED"
        ? { OR: [{ refund: null }, { refund: { status: { not: "SUCCEEDED" } } }] }
        : {}),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  { member: { fullName: { contains: query.search, mode: "insensitive" } } },
                  { providerReference: { contains: query.search, mode: "insensitive" } },
                  ...(z.string().uuid().safeParse(query.search).success
                    ? [{ externalId: query.search }, { member: { externalId: query.search } }]
                    : []),
                ],
              },
            ],
          }
        : {}),
    };
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        select: {
          id: true,
          externalId: true,
          amountPaise: true,
          method: true,
          status: true,
          createdAt: true,
          member: { select: { externalId: true, fullName: true } },
          due: { select: { purpose: true } },
          receipt: { select: { receiptNumber: true } },
          refund: {
            select: {
              externalId: true,
              status: true,
              reason: true,
              providerReference: true,
              createdAt: true,
              completedAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        skip: (query.page - 1) * 50,
      }),
      prisma.payment.count({ where }),
    ]);
    const attention = await prisma.auditLog.findMany({
      where: {
        action: "UNAPPLIED_PAYMENT_REQUIRES_REFUND_REVIEW",
        entityId: { in: payments.map((payment) => payment.id) },
      },
      select: { entityId: true },
    });
    const attentionIds = new Set(attention.map((item) => item.entityId));
    return NextResponse.json(
      payments.map((payment) => ({
        externalId: payment.externalId,
        amountPaise: payment.amountPaise,
        method: payment.method,
        createdAt: payment.createdAt,
        member: payment.member,
        purpose: payment.due?.purpose ?? "PAYMENT",
        status: payment.refund?.status === "SUCCEEDED" ? "REFUNDED" : payment.status,
        receipt: payment.receipt,
        refund: payment.refund,
        requiresRefundReview:
          attentionIds.has(payment.id) && payment.refund?.status !== "SUCCEEDED",
      })),
      { headers: { "x-total-count": String(total), "cache-control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
