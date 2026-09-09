import { NextRequest, NextResponse } from "next/server";
import { invalidateSession } from "../../../../server/auth/session";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("access_token")?.value;
  if (token) await invalidateSession(token);
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set("access_token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
