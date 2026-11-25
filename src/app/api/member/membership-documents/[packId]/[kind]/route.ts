import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { readOwnMembershipPack } from "../../../../../../server/members/membership-pack-service";
import { membershipPackPdf } from "../../../../../../server/members/membership-pack-documents";
import {
  consumeRateLimit,
  privateRateLimitKey,
} from "../../../../../../server/security/rate-limit";
import { ThrottleError } from "../../../../../../server/auth/login-throttle";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ packId: string; kind: string }> },
) {
  try {
    const actor = await requireApiPermission(request, "member:profile:read");
    const { packId, kind } = z
      .object({ packId: z.string().uuid(), kind: z.enum(["id-card", "certificate", "receipt"]) })
      .parse(await context.params);
    const pack = await readOwnMembershipPack(actor.userId, packId);
    if (!pack)
      return NextResponse.json({ error: "Membership document not found" }, { status: 404 });
    await consumeRateLimit(privateRateLimitKey("membership-documents", actor.userId), 30, 60_000);
    return new NextResponse(new Uint8Array(await membershipPackPdf(pack, kind)), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="Tuluva-Mahasabhe-${pack.testOnly ? "TEST-" : ""}${pack.grant && kind === "receipt" ? "fee-exemption-record" : kind}.pdf"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Membership document unavailable" },
      { status: error instanceof ThrottleError ? 429 : 403 },
    );
  }
}
