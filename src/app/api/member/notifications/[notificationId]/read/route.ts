import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { markNotificationReadForUser } from "../../../../../../server/notifications/notification-service";
import { requireApiPermission } from "../../../../../../server/http/authorize";
import { communicationRouteError } from "../../../../communication-route-response";

/** Marks only a notification belonging to the signed-in member as read. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  try {
    const principal = await requireApiPermission(request, "member:profile:read");
    const { notificationId: untrustedNotificationId } = await params;
    const notificationId = z.string().uuid().parse(untrustedNotificationId);
    const notification = await markNotificationReadForUser(principal.userId, notificationId);
    return NextResponse.json({ notification });
  } catch (error) {
    return communicationRouteError(error, "Notification could not be updated");
  }
}
