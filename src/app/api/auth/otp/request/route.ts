import { NextRequest, NextResponse } from "next/server";
import {
  requestPersistentOtp,
  otpRequestSchema,
  isPublicOtpPurpose,
} from "../../../../../server/auth/otp-persistence-service";
import { requireApiPermission } from "../../../../../server/http/authorize";
import { clientAddress, ThrottleError } from "../../../../../server/auth/login-throttle";
export async function POST(request: NextRequest) {
  try {
    const input = otpRequestSchema.parse(await request.json());
    const actor = isPublicOtpPurpose(input.purpose)
      ? undefined
      : await requireApiPermission(request, "member:profile:write");
    return NextResponse.json(
      await requestPersistentOtp(input, clientAddress(request.headers), actor?.userId),
    );
  } catch (error) {
    if (error instanceof ThrottleError)
      return NextResponse.json({ error: error.message }, { status: 429 });
    if (
      error instanceof Error &&
      ["Verification delivery is not configured", "Verification delivery failed"].includes(
        error.message,
      )
    )
      return NextResponse.json(
        {
          error:
            "Email/SMS verification delivery is currently unavailable. Your existing contact details remain valid.",
        },
        { status: 503 },
      );
    return NextResponse.json(
      {
        error:
          "Verification request could not be accepted. Check your details and current password.",
      },
      { status: 400 },
    );
  }
}
