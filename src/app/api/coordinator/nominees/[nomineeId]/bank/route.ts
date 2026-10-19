import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { readNomineeBankForVerification } from "../../../../../../server/members/nominee-persistence-service";
import { communicationRouteError } from "../../../../communication-route-response";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nomineeId: string }> },
) {
  try {
    const actor = await requireApiPermission(request, "coordinator:members:manage");
    const { nomineeId } = await params;
    await requireApiPermission(request, "nominee:bank:verify");
    const input = z
      .object({ reason: z.string().trim().min(3).max(1000) })
      .strict()
      .parse(await request.json());
    return NextResponse.json(
      await readNomineeBankForVerification(actor.userId, nomineeId, false, input.reason),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return communicationRouteError(error, "Nominee bank review could not be completed");
  }
}
