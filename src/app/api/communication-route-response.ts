import { NextResponse } from "next/server";

/**
 * Keep public API failures useful without returning database, authentication, or
 * provider implementation details. The workflow services still retain their
 * full audit trails server-side.
 */
export function communicationRouteError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();
  const status =
    normalized === "unauthenticated" ||
    normalized.includes("invalid token") ||
    normalized.includes("token expired") ||
    normalized.includes("session expired")
      ? 401
      : normalized.includes("forbidden") ||
          normalized.includes("permission") ||
          normalized.includes("suspended")
        ? 403
        : normalized.includes("not found")
          ? 404
          : 400;

  const safeMessages = new Set([
    "Notification not found",
    "News item not found",
    "Only drafts can be edited",
    "Only pending news can be approved",
    "Only pending news can be rejected",
    "Archived news cannot be changed",
    "A rejection reason is required",
    "An archive reason is required",
  ]);

  return NextResponse.json({ error: safeMessages.has(message) ? message : fallback }, { status });
}
