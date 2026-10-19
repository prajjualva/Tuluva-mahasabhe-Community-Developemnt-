import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { changeMemberCoordinator } from "../../../../../../server/coordinators/coordinator-management-service";
import { communicationRouteError } from "../../../../communication-route-response";

const changeSchema = z
  .object({
    replacementCoordinatorId: z.string().uuid(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { memberId: rawMemberId } = await params;
    const memberId = z.string().uuid().parse(rawMemberId);
    const body = changeSchema.parse(await request.json());
    return NextResponse.json({
      result: await changeMemberCoordinator({
        actorId: principal.userId,
        memberExternalId: memberId,
        replacementCoordinatorExternalId: body.replacementCoordinatorId,
        reason: body.reason,
      }),
    });
  } catch (error) {
    return communicationRouteError(error, "Coordinator assignment could not be changed");
  }
}
