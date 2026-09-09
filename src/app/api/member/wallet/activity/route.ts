import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { prisma } from "../../../../../server/database/prisma";
import { memberIdForUser } from "../../../../../server/payments/payment-service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function displayCategory(purpose: string, direction: "CREDIT" | "DEBIT") {
  if (purpose === "MEMBERSHIP") return "Membership payment";
  if (purpose === "CONTRIBUTION") return "Death support contribution";
  if (purpose === "PLAN_REGISTRATION") return "Community Support Plan registration";
  return direction === "CREDIT" ? "Foundation wallet credit" : "Foundation wallet payment";
}

function safePaymentExternalId(relatedExternalId: string | null) {
  return z.string().uuid().safeParse(relatedExternalId).success ? relatedExternalId : null;
}

/**
 * Returns only the authenticated member's wallet activity. Wallet and transaction
 * primary keys are deliberately never serialized: payment references, when present,
 * are already public external UUIDs.
 */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid activity limit" }, { status: 400 });
  }

  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const memberId = await memberIdForUser(principal.userId);
    const wallet = await prisma.wallet.findUnique({
      where: { memberId },
      select: {
        transactions: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: parsed.data.limit,
          select: {
            direction: true,
            amountPaise: true,
            balanceAfterPaise: true,
            purpose: true,
            relatedExternalId: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        activity:
          wallet?.transactions.map((transaction) => ({
            direction: transaction.direction,
            amountPaise: transaction.amountPaise,
            balanceAfterPaise: transaction.balanceAfterPaise,
            category: displayCategory(transaction.purpose, transaction.direction),
            paymentExternalId: safePaymentExternalId(transaction.relatedExternalId),
            createdAt: transaction.createdAt,
          })) ?? [],
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    // Do not reveal whether another member has a wallet or activity records.
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
