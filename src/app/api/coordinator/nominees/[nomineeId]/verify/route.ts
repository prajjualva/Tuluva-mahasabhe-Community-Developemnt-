import { NextRequest, NextResponse } from "next/server";

import { requireApiPermission } from "../../../../../../server/http/authorize";
import { verifyNominee } from "../../../../../../server/members/nominee-persistence-service";
import { communicationRouteError } from "../../../../communication-route-response";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nomineeId: string }> },
) {
  try {
    const actor = await requireApiPermission(request, "coordinator:members:manage");
    const { nomineeId } = await params;

    return NextResponse.json(
      await verifyNominee(actor.userId, nomineeId, false, await request.json()),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return communicationRouteError(error, "Nominee verification could not be completed");
  }
}
