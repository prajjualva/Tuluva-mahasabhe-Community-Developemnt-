import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "../../../../server/http/authorize";
import {
  administerInitialMembership,
  listInitialMembershipQueue,
} from "../../../../server/admin/admin-membership-access-service";
import { prisma } from "../../../../server/database/prisma";
import { scheduleNotificationDelivery } from "../../../../server/notifications/notification-delivery-service";

export async function GET(request: NextRequest) {
  try {
    await requireApiPermission(request, "admin:*");
    const search = z
      .string()
      .trim()
      .max(160)
      .parse(request.nextUrl.searchParams.get("search") ?? "");
    return NextResponse.json(await listInitialMembershipQueue(search));
  } catch {
    return NextResponse.json({ error: "Request denied" }, { status: 403 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "admin:*");
    const result = await administerInitialMembership(actor.userId, await request.json());
    const member = await prisma.member.findUniqueOrThrow({
      where: { externalId: result.memberExternalId },
      select: { userId: true },
    });
    scheduleNotificationDelivery({ userId: member.userId, limit: 10 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          "Membership could not be updated. Check the member, payment reference and any pending checkout before trying again.",
      },
      {
        status:
          error instanceof Error &&
          ["Forbidden", "Unauthenticated", "Session expired"].includes(error.message)
            ? 403
            : 400,
      },
    );
  }
}
