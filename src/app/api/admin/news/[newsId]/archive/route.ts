import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { archiveCommunityNews } from "../../../../../../server/news/community-news-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { communicationRouteError } from "../../../../communication-route-response";

const archiveSchema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ newsId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { newsId: rawNewsId } = await params;
    const newsId = z.string().uuid().parse(rawNewsId);
    const { reason } = archiveSchema.parse(await request.json());
    return NextResponse.json({
      news: await archiveCommunityNews({
        actorId: principal.userId,
        newsExternalId: newsId,
        reason,
      }),
    });
  } catch (error) {
    return communicationRouteError(error, "Community news could not be archived");
  }
}
