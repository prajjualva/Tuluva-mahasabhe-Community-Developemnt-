import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import {
  openSupportDispute,
  resolveSupportDispute,
} from "../../../../../../server/support/support-payment-service";
import { supportRouteError } from "../../support-route-response";

const bodySchema = z.object({
  action: z.enum(["OPEN", "RESOLVE"]),
  reason: z.string().trim().min(3).max(1000),
  resolution: z.enum(["RESUME", "REJECT"]).optional(),
  nomineeExternalId: z.string().uuid().optional(),
  selectionReason: z.string().trim().min(3).max(1000).optional(),
});

/** Opening a dispute freezes payout; only an Admin may resolve it with an audit reason. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { caseId: untrustedCaseId } = await params;
    const caseId = z.string().uuid().parse(untrustedCaseId);
    const body = bodySchema.parse(await request.json());
    if (body.action === "OPEN") {
      return NextResponse.json({
        supportCase: await openSupportDispute({
          supportCaseExternalId: caseId,
          actorId: principal.userId,
          reason: body.reason,
        }),
      });
    }
    if (!body.resolution) {
      return NextResponse.json(
        { error: "A nominee-dispute resolution is required" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      supportCase: await resolveSupportDispute({
        supportCaseExternalId: caseId,
        actorId: principal.userId,
        resolution: body.resolution,
        nomineeExternalId: body.nomineeExternalId,
        selectionReason: body.selectionReason,
        reason: body.reason,
      }),
    });
  } catch (error) {
    return supportRouteError(error, "Nominee-dispute action denied");
  }
}
