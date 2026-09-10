import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../server/database/prisma";
import { requireApiPermission } from "../../../../server/http/authorize";

/** Administrator reconciliation view; all identifiers remain external UUIDs. */
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    const payments = await prisma.payment.findMany({
      where: { status: "SUCCEEDED" },
      select: {
        externalId: true,
        amountPaise: true,
        method: true,
        createdAt: true,
        member: { select: { externalId: true, fullName: true } },
        due: { select: { purpose: true } },
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
      take: 100,
    });
    return NextResponse.json(
      payments.map((payment) => ({
        externalId: payment.externalId,
        amountPaise: payment.amountPaise,
        method: payment.method,
        createdAt: payment.createdAt,
        member: payment.member,
        purpose: payment.due?.purpose ?? "PAYMENT",
        status: payment.refund?.status === "SUCCEEDED" ? "REFUNDED" : "SUCCEEDED",
        refund: payment.refund,
      })),
    );
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
