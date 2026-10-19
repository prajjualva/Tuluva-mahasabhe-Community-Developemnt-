import { NextRequest, NextResponse } from "next/server";
import { markAllNotificationsReadForUser } from "../../../../../server/notifications/notification-service";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { communicationRouteError } from "../../../communication-route-response";

export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const result = await markAllNotificationsReadForUser(principal.userId);
    return NextResponse.json({ result });
  } catch (error) {
    return communicationRouteError(error, "Notifications could not be updated");
  }
}
