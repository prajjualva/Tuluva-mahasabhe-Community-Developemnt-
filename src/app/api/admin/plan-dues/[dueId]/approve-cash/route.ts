import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { prisma } from "../../../../../../server/database/prisma";
import { communicationRouteError } from "../../../../communication-route-response";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dueId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const dueExternalId = z
      .string()
      .uuid()
      .parse((await params).dueId);
    const input = z
      .object({ reason: z.string().trim().min(3).max(1000) })
      .strict()
      .parse(await request.json());
    const result = await prisma.$transaction(async (tx) => {
      const due = await tx.due.findUnique({ where: { externalId: dueExternalId } });
      if (
        !due ||
        due.purpose !== "PLAN_REGISTRATION" ||
        !["PENDING", "OVERDUE"].includes(due.status)
      )
        throw new Error("Payable plan registration due not found");
      await tx.auditLog.create({
        data: {
          actorId: principal.userId,
          action: "PLAN_CASH_COLLECTION_APPROVED",
          entityType: "Due",
          entityId: due.id,
          reason: input.reason,
          afterState: { dueExternalId: due.externalId, amountPaise: due.amountPaise },
        },
      });
      return { dueExternalId: due.externalId, cashCollectionApproved: true };
    });
    return NextResponse.json(result);
  } catch (error) {
    return communicationRouteError(error, "Plan cash approval could not be recorded");
  }
}
