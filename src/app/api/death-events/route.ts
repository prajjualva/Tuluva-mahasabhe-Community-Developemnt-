import { NextResponse } from "next/server";
import { listPublishedDeathSupportEvents } from "../../../server/death/death-workflow-service";

/** Public event feed intentionally contains only Admin-approved public information. */
export async function GET() {
  try {
    return NextResponse.json(
      { events: await listPublishedDeathSupportEvents() },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch {
    return NextResponse.json({ error: "Death Support Events are unavailable" }, { status: 503 });
  }
}
