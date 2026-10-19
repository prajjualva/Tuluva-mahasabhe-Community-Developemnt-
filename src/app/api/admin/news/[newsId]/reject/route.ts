import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rejectFoundationNews } from "../../../../../../server/news/community-news-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { communicationRouteError } from "../../../../communication-route-response";

const rejectSchema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ newsId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { newsId: rawNewsId } = await params;
    const newsId = z.string().uuid().parse(rawNewsId);
    const { reason } = rejectSchema.parse(await request.json());
    return NextResponse.json({
      news: await rejectFoundationNews({
        actorId: principal.userId,
        newsExternalId: newsId,
        reason,
      }),
    });
  } catch (error) {
    return communicationRouteError(error, "Foundation news could not be rejected");
  }
}
