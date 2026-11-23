import { publicErrorMessage } from "../../../../../server/http/public-error";
import { NextRequest, NextResponse } from "next/server";
import {
  addCondolenceComment,
  listPublishedEventComments,
} from "../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { z } from "zod";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const authenticated = !!(
      request.cookies.get("access_token")?.value || request.headers.get("authorization")
    );
    const actor = authenticated ? await requireApiPermission(request, "member:profile:read") : null;
    return NextResponse.json(
      { comments: await listPublishedEventComments(eventId, actor?.userId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Comments not found" }, { status: 404 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const { eventId } = await params;
    const { body } = z
      .object({ body: z.string().trim().min(2).max(1000), rulesAccepted: z.literal(true) })
      .strict()
      .parse(await request.json());
    return NextResponse.json(
      { comment: await addCondolenceComment(eventId, principal.userId, { body }) },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Comment could not be posted") },
      { status: 400 },
    );
  }
}
