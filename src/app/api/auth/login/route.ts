import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../server/database/prisma";
import { verifyPassword } from "../../../../server/auth/password";
import { persistSession, signAccessToken } from "../../../../server/auth/session";
import {
  assertLoginAllowed,
  clearLoginFailures,
  loginThrottleKey,
  recordLoginFailure,
} from "../../../../server/auth/login-throttle";

const bodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.parse(await request.json());
    const key = loginThrottleKey(
      body.email,
      request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local",
    );
    await assertLoginAllowed(key);
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      select: { id: true, passwordHash: true, status: true },
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
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set("access_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 15 * 60,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
