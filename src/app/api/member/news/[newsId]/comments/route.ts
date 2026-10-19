import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  addNewsComment,
  listNewsCommentsForMember,
} from "../../../../../../server/news/community-news-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { communicationRouteError } from "../../../../communication-route-response";

const commentSchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ newsId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const { newsId: rawNewsId } = await params;
    const newsId = z.string().uuid().parse(rawNewsId);
    return NextResponse.json(
      { comments: await listNewsCommentsForMember(newsId, principal.userId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return communicationRouteError(error, "News comments are unavailable");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ newsId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "member:profile:write");
    const { newsId: rawNewsId } = await params;
    const newsId = z.string().uuid().parse(rawNewsId);
    const { body } = commentSchema.parse(await request.json());
    return NextResponse.json(
      {
        comment: await addNewsComment({ newsExternalId: newsId, actorId: principal.userId, body }),
      },
      { status: 201 },
    );
  } catch (error) {
    return communicationRouteError(error, "News comment could not be added");
  }
}
