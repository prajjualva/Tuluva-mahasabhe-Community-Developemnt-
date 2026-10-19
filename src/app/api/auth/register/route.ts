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

export async function POST(request: NextRequest) {
  const key = registrationThrottleKey(clientAddress(request.headers));
  try {
    await consumeRateLimit(
      privateRateLimitKey("registration-requests", clientAddress(request.headers)),
      10,
      15 * 60000,
    );
    await assertLoginAllowed(key);
    const member = await registerMemberPersistently(await request.json());
    await clearLoginFailures(key);
    return NextResponse.json(member, { status: 201 });
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
          error instanceof ZodError
            ? "Please check your name, contact details, referral code and password."
            : error instanceof Error && error.message === "Referral code is invalid or inactive"
              ? error.message
              : "Registration could not be completed",
      },
      { status: 400 },
    );
  }
}
