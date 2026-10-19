import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCoordinatorNews,
  listCoordinatorNews,
} from "../../../../server/news/community-news-service";
import { requireApiPermission } from "../../../../server/http/authorize";
import { communicationRouteError } from "../../communication-route-response";

const createSchema = z
  .object({
    title: z.string().trim().min(3).max(180),
    body: z.string().trim().min(3).max(10000),
    publish: z.boolean().optional(),
    audience: z.enum(["COORDINATOR_MEMBERS", "FOUNDATION_WIDE"]).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "coordinator:members:manage");
    return NextResponse.json(
      { news: await listCoordinatorNews(principal.userId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return communicationRouteError(error, "Coordinator news is unavailable");
  }
}

/** A Coordinator can publish only to members currently assigned to that Coordinator. */
export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "coordinator:members:manage");
    const input = createSchema.parse(await request.json());
    const news = await createCoordinatorNews({ ...input, actorId: principal.userId });
    return NextResponse.json({ news }, { status: 201 });
  } catch (error) {
    return communicationRouteError(error, "Coordinator news could not be created");
  }
}
