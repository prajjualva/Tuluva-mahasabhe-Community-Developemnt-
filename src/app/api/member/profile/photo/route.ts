import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "../../../../../server/http/authorize";
import {
  maxProfilePhotoUploadBytes,
  normalizeProfilePhoto,
  ProfilePhotoInputError,
  readOwnProfilePhoto,
  updateOwnProfilePhoto,
} from "../../../../../server/members/profile-photo-service";
import { consumeRateLimit, privateRateLimitKey } from "../../../../../server/security/rate-limit";
import { ThrottleError } from "../../../../../server/auth/login-throttle";
import { communicationRouteError } from "../../../communication-route-response";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

async function readUpload(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) throw new ProfilePhotoInputError("Choose a photo to upload.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > maxProfilePhotoUploadBytes) {
        await reader.cancel();
        throw new ProfilePhotoInputError("Choose a photo no larger than 3 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:read");
    const bytes = await readOwnProfilePhoto(actor.userId);
    if (!bytes) return new Response(null, { status: 404, headers: privateHeaders });
    return new Response(new Uint8Array(bytes), {
      headers: { ...privateHeaders, "Content-Type": "image/webp" },
    });
  } catch (error) {
    return communicationRouteError(error, "Profile photo is unavailable");
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:write");
    await consumeRateLimit(privateRateLimitKey("profile-photo", actor.userId), 10, 60 * 60_000);
    const bytes = await normalizeProfilePhoto(
      await readUpload(request),
      request.headers.get("content-type"),
    );
    const photoUpdatedAt = await updateOwnProfilePhoto(actor.userId, bytes);
    return NextResponse.json({ photoUpdatedAt }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof ProfilePhotoInputError || error instanceof ThrottleError)
      return NextResponse.json(
        { error: error.message },
        {
          status: error instanceof ThrottleError ? 429 : 400,
          headers: privateHeaders,
        },
      );
    return communicationRouteError(error, "Profile photo could not be updated");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await requireApiPermission(request, "member:profile:write");
    await updateOwnProfilePhoto(actor.userId, null);
    return NextResponse.json({ photoUpdatedAt: null }, { headers: privateHeaders });
  } catch (error) {
    return communicationRouteError(error, "Profile photo could not be removed");
  }
}
