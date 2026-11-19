import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  maxProfilePhotoUploadBytes,
  normalizeProfilePhoto,
  ProfilePhotoInputError,
} from "../src/server/members/profile-photo-service";

describe("profile photo input", () => {
  it("stores only a square WebP and discards original metadata", async () => {
    const png = await sharp({
      create: { width: 400, height: 200, channels: 3, background: "#e8f4ee" },
    })
      .withMetadata()
      .png()
      .toBuffer();
    const normalized = await normalizeProfilePhoto(png, "image/png");
    const metadata = await sharp(normalized).metadata();

    expect(metadata).toMatchObject({ format: "webp", width: 320, height: 320 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(normalized.length).toBeLessThan(256 * 1024);
    await expect(normalizeProfilePhoto(png, "image/jpeg")).rejects.toBeInstanceOf(
      ProfilePhotoInputError,
    );
  });

  it("rejects unsupported types, oversized uploads and corrupt images", async () => {
    await expect(normalizeProfilePhoto(Buffer.from("<svg/>"), "image/svg+xml")).rejects.toThrow(
      "JPEG",
    );
    await expect(
      normalizeProfilePhoto(Buffer.alloc(maxProfilePhotoUploadBytes + 1), "image/png"),
    ).rejects.toThrow("3 MB");
    await expect(normalizeProfilePhoto(Buffer.from("invalid"), "image/png")).rejects.toThrow(
      "could not be read",
    );
  });
});
