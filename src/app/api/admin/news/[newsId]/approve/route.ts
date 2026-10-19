import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { approveFoundationNews } from "../../../../../../server/news/community-news-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { communicationRouteError } from "../../../../communication-route-response";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ newsId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const { newsId: rawNewsId } = await params;
    const newsId = z.string().uuid().parse(rawNewsId);
    return NextResponse.json({
      news: await approveFoundationNews({ actorId: principal.userId, newsExternalId: newsId }),
    });
  } catch (error) {
    return communicationRouteError(error, "Foundation news could not be approved");
  }
}
