import { NextRequest, NextResponse } from "next/server";
import { readActiveAccessPrincipal } from "../../../../server/http/authorize";
import { communicationRouteError } from "../../communication-route-response";
import {
  cancelDeletionRequest,
  readOwnDeletionRequest,
  submitDeletionRequest,
} from "../../../../server/members/account-deletion-service";
import { consumeRateLimit, privateRateLimitKey } from "../../../../server/security/rate-limit";
import { ThrottleError } from "../../../../server/auth/login-throttle";

const headers = { "Cache-Control": "private, no-store" };

async function actor(request: NextRequest) {
  const token = request.cookies.get("access_token")?.value;
  if (!token) throw new Error("Unauthenticated");
  return readActiveAccessPrincipal(token);
}

export async function GET(request: NextRequest) {
  try {
    const principal = await actor(request);
    return NextResponse.json(await readOwnDeletionRequest(principal.userId), { headers });
  } catch (error) {
    return communicationRouteError(error, "Your deletion request is unavailable");
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await actor(request);
    await consumeRateLimit(
      privateRateLimitKey("deletion-request", principal.userId),
      10,
      60 * 60_000,
    );
    return NextResponse.json(await submitDeletionRequest(principal.userId, await request.json()), {
      headers,
    });
  } catch (error) {
    if (error instanceof ThrottleError)
      return NextResponse.json({ error: error.message }, { status: 429, headers });
    return communicationRouteError(error, "Your deletion request could not be submitted");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const principal = await actor(request);
    return NextResponse.json(await cancelDeletionRequest(principal.userId), { headers });
  } catch (error) {
    return communicationRouteError(error, "Your deletion request could not be cancelled");
  }
}
