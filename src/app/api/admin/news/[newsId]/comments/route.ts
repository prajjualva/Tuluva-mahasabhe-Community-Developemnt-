import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listNewsCommentsForModerator } from "../../../../../../server/news/community-news-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { communicationRouteError } from "../../../../communication-route-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ newsId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { newsId: rawNewsId } = await params;
    const newsId = z.string().uuid().parse(rawNewsId);
    return NextResponse.json(
      {
        comments: await listNewsCommentsForModerator({
          actorId: principal.userId,
          newsExternalId: newsId,
          moderator: "ADMIN",
        }),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return communicationRouteError(error, "News comments are unavailable");
  }
}
