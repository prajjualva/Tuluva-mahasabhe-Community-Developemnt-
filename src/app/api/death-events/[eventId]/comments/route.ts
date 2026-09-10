import { NextRequest, NextResponse } from "next/server";
import {
  addCondolenceComment,
  listPublishedEventComments,
} from "../../../../../server/death/death-workflow-service";
import { requireApiPermission } from "../../../../../server/http/authorize";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    return NextResponse.json(
      { comments: await listPublishedEventComments(eventId) },
      { headers: { "Cache-Control": "public, max-age=60" } },
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
    return NextResponse.json(
      { comment: await addCondolenceComment(eventId, principal.userId, await request.json()) },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Comment could not be posted" },
      { status: 400 },
    );
  }
}
