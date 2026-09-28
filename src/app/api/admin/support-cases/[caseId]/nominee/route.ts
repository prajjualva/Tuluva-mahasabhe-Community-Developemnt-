import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { selectSupportNominee } from "../../../../../../server/support/support-payment-service";
import { supportRouteError } from "../../support-route-response";

const bodySchema = z.object({
  nomineeExternalId: z.string().uuid(),
  selectionReason: z.string().trim().min(3).max(1000).optional(),
});

/** Selects a current, verified nominee only; the service checks encrypted bank data internally. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { caseId: untrustedCaseId } = await params;
    const caseId = z.string().uuid().parse(untrustedCaseId);
    const body = bodySchema.parse(await request.json());
    return NextResponse.json({
      supportCase: await selectSupportNominee({
        supportCaseExternalId: caseId,
        actorId: principal.userId,
        nomineeExternalId: body.nomineeExternalId,
        selectionReason: body.selectionReason,
      }),
    });
  } catch (error) {
    return supportRouteError(error, "Nominee selection denied");
  }
}
