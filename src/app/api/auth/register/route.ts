import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  assertLoginAllowed,
  clientAddress,
  clearLoginFailures,
  recordLoginFailure,
  registrationThrottleKey,
  ThrottleError,
} from "../../../../server/auth/login-throttle";
import { registerMemberPersistently } from "../../../../server/members/registration-service";
import { consumeRateLimit, privateRateLimitKey } from "../../../../server/security/rate-limit";
import { ZodError } from "zod";
import { scheduleNotificationDelivery } from "../../../../server/notifications/notification-delivery-service";
import { readBoundedBody } from "../../../../server/http/bounded-body";
import {
  maxProfilePhotoUploadBytes,
  normalizeProfilePhoto,
  ProfilePhotoInputError,
} from "../../../../server/members/profile-photo-service";
import { persistSession, signAccessToken } from "../../../../server/auth/session";

export async function POST(request: NextRequest) {
  const key = registrationThrottleKey(clientAddress(request.headers));
  try {
    await consumeRateLimit(
      privateRateLimitKey("registration-requests", clientAddress(request.headers)),
      10,
      15 * 60000,
    );
    await assertLoginAllowed(key);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data"))
      throw new ProfilePhotoInputError("Add a profile photo to complete registration.");
    const bytes = await readBoundedBody(request, maxProfilePhotoUploadBytes + 16 * 1024);
    const form = await new Response(new Uint8Array(bytes), {
      headers: { "content-type": contentType },
    }).formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new ProfilePhotoInputError("Choose your profile photo.");
    const photo = await normalizeProfilePhoto(Buffer.from(await file.arrayBuffer()), file.type);
    const { userId, ...member } = await registerMemberPersistently(Object.fromEntries(form), photo);
    await clearLoginFailures(key);
    scheduleNotificationDelivery({ relatedExternalId: member.memberExternalId, limit: 4 });
    const token = await signAccessToken(userId, []);
    await persistSession(token, userId, request.headers.get("user-agent"));
    const response = NextResponse.json(
      { ...member, redirectTo: "/membership-payment" },
      { status: 201 },
    );
    response.cookies.set("access_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 15 * 60,
    });
    return response;
  } catch (error) {
    if (error instanceof ThrottleError)
      return NextResponse.json({ error: error.message }, { status: 429 });
    await recordLoginFailure(key);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return NextResponse.json(
        { error: "An account with that email or mobile already exists" },
        { status: 409 },
      );
    return NextResponse.json(
      {
        error:
          error instanceof ProfilePhotoInputError
            ? error.message
            : error instanceof ZodError
              ? "Please check your name, contact details, referral code and password."
              : error instanceof Error && error.message === "Referral code is invalid or inactive"
                ? error.message
                : "Registration could not be completed",
      },
      { status: 400 },
    );
  }
}
