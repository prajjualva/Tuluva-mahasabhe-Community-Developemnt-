import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { memberIdForUser } from "../../../../server/payments/payment-service";
import { prisma } from "../../../../server/database/prisma";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const memberId = await memberIdForUser(principal.userId);
    const wallet = await prisma.wallet.findUnique({
      where: { memberId },
      // A wallet's database id and optimistic-lock version are implementation details.
      // Members only need the balance from this endpoint; activity has its own scoped feed.
      select: { balancePaise: true },
    });
    return NextResponse.json(wallet ?? { balancePaise: 0 }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
