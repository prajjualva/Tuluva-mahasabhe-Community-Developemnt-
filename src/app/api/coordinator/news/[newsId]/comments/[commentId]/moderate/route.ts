import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { moderateNewsComment } from "../../../../../../../../server/news/community-news-service";
import { requireApiPermission } from "../../../../../../../../server/http/authorize";
import { communicationRouteError } from "../../../../../../communication-route-response";

const moderationSchema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ newsId: string; commentId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "coordinator:members:manage");
    const { newsId: rawNewsId, commentId: rawCommentId } = await params;
    const newsId = z.string().uuid().parse(rawNewsId);
    const commentId = z.string().uuid().parse(rawCommentId);
    const { reason } = moderationSchema.parse(await request.json());
    return NextResponse.json({
      comment: await moderateNewsComment({
        actorId: principal.userId,
        newsExternalId: newsId,
        commentExternalId: commentId,
        reason,
        moderator: "COORDINATOR",
      }),
    });
  } catch (error) {
    return communicationRouteError(error, "News comment could not be moderated");
  }
}
