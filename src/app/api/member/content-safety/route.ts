import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../server/http/authorize";
import { consumeRateLimit, privateRateLimitKey } from "../../../../server/security/rate-limit";
import {
  blockCommentAuthor,
  reportContent,
  listOwnBlocks,
  unblockAuthor,
} from "../../../../server/community/content-safety";
import { communicationRouteError } from "../../communication-route-response";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:read");
    return NextResponse.json(
      { blocks: await listOwnBlocks(actor.userId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return communicationRouteError(error, "Blocked authors are unavailable");
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:write");
    await consumeRateLimit(privateRateLimitKey("content-safety", actor.userId), 30, 3600000);
    const { action, target } = z
      .object({ action: z.enum(["REPORT", "BLOCK"]), target: z.unknown() })
      .strict()
      .parse(await request.json());
    const result =
      action === "REPORT"
        ? await reportContent(actor.userId, target)
        : await blockCommentAuthor(actor.userId, target);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return communicationRouteError(
      error,
      "This action could not be completed. Check the details and try again.",
    );
  }
}
export async function DELETE(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:write");
    const { externalId } = z
      .object({ externalId: z.string().uuid() })
      .strict()
      .parse(await request.json());
    return NextResponse.json(await unblockAuthor(actor.userId, externalId));
  } catch (error) {
    return communicationRouteError(error, "Author could not be unblocked");
  }
}
