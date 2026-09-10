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

export async function POST(request: NextRequest) {
  const key = registrationThrottleKey(clientAddress(request.headers));
  try {
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
      { error: error instanceof Error ? error.message : "Registration failed" },
      { status: 400 },
    );
  }
}
