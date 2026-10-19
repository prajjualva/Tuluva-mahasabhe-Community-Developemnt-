import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../../../../server/http/authorize";
import { downloadNomineeEvidence } from "../../../../../../../../server/members/nominee-persistence-service";
import { communicationRouteError } from "../../../../../../communication-route-response";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nomineeId: string; documentId: string }> },
) {
  try {
    const actor = await requireApiPermission(request, "member:profile:read");
    const { nomineeId, documentId } = await params;
    const evidence = await downloadNomineeEvidence(actor.userId, nomineeId, documentId, "MEMBER");
    return new NextResponse(evidence.bytes, {
      headers: {
        "content-type": evidence.contentType,
        "content-disposition": 'attachment; filename="nominee-evidence"',
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return communicationRouteError(error, "Nominee evidence is unavailable");
  }
}
