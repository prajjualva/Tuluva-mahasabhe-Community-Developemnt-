import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../server/http/authorize";
import { listCoordinatorsForAdmin } from "../../../../server/coordinators/coordinator-management-service";
import { communicationRouteError } from "../../communication-route-response";
import { createCoordinatorProfile } from "../../../../server/admin/admin-command-service";
import { scheduleNotificationDelivery } from "../../../../server/notifications/notification-delivery-service";
import { CoordinatorAppointmentError } from "../../../../domain/coordinator-appointment";
import { ZodError } from "zod";

export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    return NextResponse.json(
      { coordinators: await listCoordinatorsForAdmin() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return communicationRouteError(error, "Coordinator records are unavailable");
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPermission(request, "admin:*");
    const coordinator = await createCoordinatorProfile(principal.userId, await request.json());
    scheduleNotificationDelivery({ relatedExternalId: coordinator.externalId, limit: 2 });
    return NextResponse.json(coordinator);
  } catch (error) {
    if (error instanceof CoordinatorAppointmentError)
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error:
            "Confirm the Coordinator fee exemption, use a referral code of 6–16 letters or numbers, and provide an appointment reason of 3–1,000 characters.",
        },
        { status: 400 },
      );
    return communicationRouteError(error, "Coordinator could not be appointed");
  }
}
