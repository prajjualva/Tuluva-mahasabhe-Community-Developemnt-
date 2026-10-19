import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { uploadNomineeEvidence } from "../../../../../../server/members/nominee-persistence-service";
import { communicationRouteError } from "../../../../communication-route-response";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nomineeId: string }> },
) {
  try {
    const actor = await requireApiPermission(request, "member:profile:write");
    const { nomineeId } = await params;
    const form = await request.formData();
    const file = form.get("evidence");
    if (!(file instanceof File)) throw new Error("Evidence file is required");
    return NextResponse.json(await uploadNomineeEvidence(actor.userId, nomineeId, file));
  } catch (error) {
    return communicationRouteError(error, "Nominee evidence could not be saved");
  }
}
