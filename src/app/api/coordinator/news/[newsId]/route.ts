import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateCoordinatorNewsDraft } from "../../../../../server/news/community-news-service";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { communicationRouteError } from "../../../communication-route-response";

const updateSchema = z
  .object({
    title: z.string().trim().min(3).max(180),
    body: z.string().trim().min(3).max(10000),
  })
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ newsId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "coordinator:members:manage");
    const { newsId: rawNewsId } = await params;
    const newsId = z.string().uuid().parse(rawNewsId);
    const input = updateSchema.parse(await request.json());
    return NextResponse.json({
      news: await updateCoordinatorNewsDraft({
        ...input,
        actorId: principal.userId,
        newsExternalId: newsId,
      }),
    });
  } catch (error) {
    return communicationRouteError(error, "Coordinator news could not be updated");
  }
}
