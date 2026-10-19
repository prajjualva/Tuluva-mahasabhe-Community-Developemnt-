import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../server/database/prisma";
import { verifyPassword } from "../../../../server/auth/password";
import { persistSession, signAccessToken } from "../../../../server/auth/session";
import { loginDestination } from "../../../../server/auth/login-destination";
import { consumeRateLimit, privateRateLimitKey } from "../../../../server/security/rate-limit";
import {
  assertLoginAllowed,
  clientAddress,
  clearLoginFailures,
  loginThrottleKey,
  recordLoginFailure,
  ThrottleError,
} from "../../../../server/auth/login-throttle";

const bodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.parse(await request.json());
    await consumeRateLimit(
      privateRateLimitKey("login-ip", clientAddress(request.headers)),
      30,
      15 * 60000,
    );
    const key = loginThrottleKey(body.email, clientAddress(request.headers));
    await assertLoginAllowed(key);
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        roles: { where: { active: true }, select: { role: { select: { code: true } } } },
        member: { select: { coordinatorProfile: { select: { status: true, isSuspended: true } } } },
      },
    });
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !user.passwordHash ||
      !(await verifyPassword(user.passwordHash, body.password))
    ) {
      await recordLoginFailure(key);
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    await clearLoginFailures(key);
    // Authorization is refreshed from Prisma on each protected request; no permissions are trusted from this cookie.
    const token = await signAccessToken(user.id, []);
    await persistSession(token, user.id, request.headers.get("user-agent"));
    const redirectTo = await loginDestination(user.id);
    const response = NextResponse.json({ authenticated: true, redirectTo });
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
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
