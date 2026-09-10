import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { memberIdForUser } from "../../../../server/payments/payment-service";
import { prisma } from "../../../../server/database/prisma";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const memberId = await memberIdForUser(principal.userId);
    const dues = await prisma.due.findMany({
      where: { memberId, status: { in: ["PENDING", "OVERDUE", "EXPIRED"] } },
      select: {
        id: true,
        externalId: true,
        purpose: true,
        amountPaise: true,
        dueAt: true,
        status: true,
      },
      orderBy: [{ dueAt: "asc" }, { externalId: "asc" }],
    });
    const contributionDueIds = dues
      .filter((due) => due.purpose === "CONTRIBUTION")
      .map((due) => due.id);
    const contributions = contributionDueIds.length
      ? await prisma.contribution.findMany({
          where: { memberId, dueId: { in: contributionDueIds } },
          select: { dueId: true, event: { select: { externalId: true } } },
        })
      : [];
    const eventExternalIdByDueId = new Map<string, string>();
    for (const contribution of contributions) {
      if (contribution.dueId)
        eventExternalIdByDueId.set(contribution.dueId, contribution.event.externalId);
    }
    // Keep database IDs server-side while allowing an intentional per-event payment.
    return NextResponse.json(
      dues.map(({ id, ...due }) => ({
        ...due,
        contributionEventExternalId: eventExternalIdByDueId.get(id) ?? null,
      })),
    );
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
