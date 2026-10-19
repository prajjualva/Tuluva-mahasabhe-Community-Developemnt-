import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listNotificationsForUser,
  unreadNotificationCountForUser,
} from "../../../../server/notifications/notification-service";
import { requireApiPermission } from "../../../../server/http/authorize";
import { communicationRouteError } from "../../communication-route-response";

const querySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** The caller identity is always the inbox owner; no member id is accepted. */
export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const [notifications, unread] = await Promise.all([
      listNotificationsForUser(principal.userId, {
        unreadOnly: query.unreadOnly === "true",
        limit: query.limit,
      }),
      unreadNotificationCountForUser(principal.userId),
    ]);
    return NextResponse.json(
      { notifications, unreadCount: unread.count },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return communicationRouteError(error, "Notification inbox is unavailable");
  }
}
