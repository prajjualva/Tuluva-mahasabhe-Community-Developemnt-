import { NextRequest, NextResponse } from "next/server";
import {
  verifyPersistentOtp,
  otpVerifySchema,
  isPublicOtpPurpose,
} from "../../../../../server/auth/otp-persistence-service";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { clientAddress, ThrottleError } from "../../../../../server/auth/login-throttle";
import { persistSession, signAccessToken } from "../../../../../server/auth/session";
import { loginDestination } from "../../../../../server/auth/login-destination";
export async function POST(request: NextRequest) {
  try {
    const input = otpVerifySchema.parse(await request.json());
    const actor = isPublicOtpPurpose(input.purpose)
      ? undefined
      : await requireApiPermission(request, "member:profile:write");
    const result = await verifyPersistentOtp(input, clientAddress(request.headers), actor?.userId);
    const response = NextResponse.json({
      verified: true,
      redirectTo: result.purpose === "LOGIN" ? await loginDestination(result.userId) : undefined,
      signInRequired: input.purpose.startsWith("CHANGE_") || input.purpose === "PASSWORD_RESET",
    });
    if (result.purpose === "LOGIN") {
      const token = await signAccessToken(result.userId, []);
      await persistSession(token, result.userId, request.headers.get("user-agent"));
      response.cookies.set("access_token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 15 * 60,
      });
    } else if (input.purpose.startsWith("CHANGE_") || input.purpose === "PASSWORD_RESET") {
      response.cookies.set("access_token", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof ThrottleError)
      return NextResponse.json({ error: error.message }, { status: 429 });
    return NextResponse.json(
      { error: "Verification code is invalid, expired, or no longer available." },
      { status: 400 },
    );
  }
}
