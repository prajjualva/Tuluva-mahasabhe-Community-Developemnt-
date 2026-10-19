import { NextRequest, NextResponse } from "next/server";
import { listCommunityNewsForMember } from "../../../../server/news/community-news-service";
import { requireApiPermission } from "../../../../server/http/authorize";
import { communicationRouteError } from "../../communication-route-response";

/** Published news is audience-filtered by the signed-in member on the server. */
export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const news = await listCommunityNewsForMember(principal.userId);
    return NextResponse.json({ news }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return communicationRouteError(error, "Community news is unavailable");
  }
}
