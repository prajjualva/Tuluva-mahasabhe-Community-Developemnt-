import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listFoundationNewsForAdmin,
  submitFoundationNewsForApproval,
} from "../../../../server/news/community-news-service";
import { requireApiPermission } from "../../../../server/http/authorize";
import { communicationRouteError } from "../../communication-route-response";

const foundationNewsSchema = z
  .object({
    title: z.string().trim().min(3).max(180),
    body: z.string().trim().min(3).max(10000),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    return NextResponse.json(
      { news: await listFoundationNewsForAdmin() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return communicationRouteError(error, "Foundation news is unavailable");
  }
}

/** Even an Admin-authored Foundation-wide story enters approval for an auditable release. */
export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const input = foundationNewsSchema.parse(await request.json());
    return NextResponse.json(
      { news: await submitFoundationNewsForApproval({ ...input, actorId: principal.userId }) },
      { status: 201 },
    );
  } catch (error) {
    return communicationRouteError(error, "Foundation news could not be submitted");
  }
}
