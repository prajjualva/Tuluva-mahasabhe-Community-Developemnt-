import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { prisma } from "../../../../../../server/database/prisma";
import { applyFoundationWalletCredit } from "../../../../../../server/payments/wallet-service";
import {
  rupeeTextToPaise,
  walletCreditRequestSchema,
} from "../../../../../../server/payments/wallet-credit-request";

const memberIdSchema = z.string().uuid();

/** A durable, auditable Foundation-issued wallet credit (for approved adjustments/refunds). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { memberId: rawMemberId } = await params;
    const memberExternalId = memberIdSchema.parse(rawMemberId);
    const input = walletCreditRequestSchema.parse(await request.json());
    const member = await prisma.member.findUnique({
      where: { externalId: memberExternalId },
      select: { id: true },
    });
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    const entry = await applyFoundationWalletCredit(
      member.id,
      rupeeTextToPaise(input.amountRupees),
      "ADMIN_APPROVED_CREDIT",
      principal.userId,
      input.reason,
    );
    return NextResponse.json({
      memberExternalId,
      amountPaise: entry.amountPaise,
      balanceAfterPaise: entry.balanceAfterPaise,
      createdAt: entry.createdAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Wallet credit was denied" },
      { status: 400 },
    );
  }
}
