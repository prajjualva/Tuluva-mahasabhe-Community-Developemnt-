import { NextResponse } from "next/server";
import { publicErrorMessage } from "../../../../server/http/public-error";

/**
 * Keep authentication failures distinct from validation/workflow failures without
 * serializing internal error details. Admin routes use this helper consistently
 * so a stale session does not look like a rejected support-payment decision.
 */
export function supportRouteError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const normalized = message.toLowerCase();
  const status =
    normalized === "unauthenticated" ||
    normalized.includes("invalid token") ||
    normalized.includes("token expired") ||
    normalized.includes("session expired")
      ? 401
      : normalized.includes("permission denied") || normalized.includes("forbidden")
        ? 403
        : normalized.includes("not found")
          ? 404
          : 400;

  return NextResponse.json({ error: publicErrorMessage(error, fallback) }, { status });
}
