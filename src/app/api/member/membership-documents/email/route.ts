import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { readOwnMembershipPack } from "../../../../../server/members/membership-pack-service";
import { prisma } from "../../../../../server/database/prisma";
import { consumeRateLimit, privateRateLimitKey } from "../../../../../server/security/rate-limit";
import { ThrottleError } from "../../../../../server/auth/login-throttle";
import { createInAppNotificationInTransaction } from "../../../../../server/notifications/notification-service";
import { runSerializablePaymentTransaction } from "../../../../../server/payments/payment-integrity";
import { scheduleNotificationDelivery } from "../../../../../server/notifications/notification-delivery-service";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:read");
    await consumeRateLimit(privateRateLimitKey("membership-pack-email", actor.userId), 3, 3600000);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { emailVerifiedAt: true },
    });
    const pack = await readOwnMembershipPack(actor.userId);
    if (!pack || !user.emailVerifiedAt)
      return NextResponse.json(
        { error: "Verify your email and initial payment first" },
        { status: 400 },
      );
    await runSerializablePaymentTransaction(async (tx) => {
      await createInAppNotificationInTransaction(tx, {
        userId: actor.userId,
        type: pack.grant ? "MEMBERSHIP_GRANTED" : "MEMBERSHIP_ACTIVATED",
        title: "Membership documents requested",
        body: "Your issued membership pack was requested by you for email delivery.",
        relatedExternalId: pack.externalId,
        idempotencyKey: `membership-pack-resend:${pack.id}:${Math.floor(Date.now() / 3600000)}`,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "MEMBERSHIP_PACK_EMAIL_REQUESTED",
          entityType: "MembershipPack",
          entityId: pack.id,
        },
      });
    });
    scheduleNotificationDelivery({
      userId: actor.userId,
      relatedExternalId: pack.externalId,
      limit: 3,
    });
    return NextResponse.redirect(
      new URL("/member/membership-documents?email=queued", request.url),
      303,
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Membership email could not be requested" },
      { status: error instanceof ThrottleError ? 429 : 403 },
    );
  }
}
