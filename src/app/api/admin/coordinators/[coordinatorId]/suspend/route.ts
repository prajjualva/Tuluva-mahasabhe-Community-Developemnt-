import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { suspendCoordinatorAndReassign } from "../../../../../../server/coordinators/coordinator-management-service";
import { communicationRouteError } from "../../../../communication-route-response";

const suspendSchema = z
  .object({
    reason: z.string().trim().min(3).max(1000),
    mode: z.enum(["FOUNDATION_ADMIN", "TRANSFER"]),
    replacementCoordinatorId: z.string().uuid().optional(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ coordinatorId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { coordinatorId: rawCoordinatorId } = await params;
    const coordinatorId = z.string().uuid().parse(rawCoordinatorId);
    const body = suspendSchema.parse(await request.json());
    return NextResponse.json({
      result: await suspendCoordinatorAndReassign({
        actorId: principal.userId,
        coordinatorExternalId: coordinatorId,
        reason: body.reason,
        mode: body.mode,
        replacementCoordinatorExternalId: body.replacementCoordinatorId,
      }),
    });
  } catch (error) {
    return communicationRouteError(error, "Coordinator could not be suspended");
  }
}
