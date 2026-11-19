import sharp from "sharp";
import { z } from "zod";
import { prisma } from "../database/prisma";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";

export const maxProfilePhotoUploadBytes = 3 * 1024 * 1024;
const imageTypes = z.enum(["image/jpeg", "image/png", "image/webp"]);
const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const;

export class ProfilePhotoInputError extends Error {}

export async function normalizeProfilePhoto(bytes: Buffer, contentType: string | null) {
  const type = imageTypes.safeParse(contentType);
  if (!type.success) throw new ProfilePhotoInputError("Choose a JPEG, PNG or WebP photo.");
  if (!bytes.length || bytes.length > maxProfilePhotoUploadBytes)
    throw new ProfilePhotoInputError("Choose a photo no larger than 3 MB.");

  try {
    const image = sharp(bytes, { limitInputPixels: 25_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== formats[type.data] || (metadata.pages ?? 1) !== 1)
      throw new Error("Unexpected image format");
    const result = await image
      .rotate()
      .resize(320, 320, { fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer();
    if (result.length > 256 * 1024) throw new Error("Unexpected photo size");
    return result;
  } catch {
    throw new ProfilePhotoInputError(
      "This photo could not be read. Try another JPEG, PNG or WebP.",
    );
  }
}

export async function readOwnProfilePhoto(userId: string) {
  const member = await prisma.member.findFirst({
    where: { userId, status: { notIn: ["CLOSED", "DECEASED"] } },
    select: { profilePhoto: { select: { bytes: true } } },
  });
  return member?.profilePhoto?.bytes ?? null;
}

export async function updateOwnProfilePhoto(userId: string, bytes: Buffer | null) {
  return runSerializablePaymentTransaction(async (tx) => {
    const member = await tx.member.findFirst({
      where: { userId, status: { notIn: ["CLOSED", "DECEASED"] } },
      select: { id: true },
    });
    if (!member) throw new Error("Member not found");
    if (bytes) {
      const photo = await tx.memberProfilePhoto.upsert({
        where: { memberId: member.id },
        create: { memberId: member.id, bytes: new Uint8Array(bytes) },
        update: { bytes: new Uint8Array(bytes) },
        select: { updatedAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          entityId: member.id,
          entityType: "Member",
          action: "MEMBER_PROFILE_PHOTO_UPDATED",
        },
      });
      return photo.updatedAt;
    }
    const result = await tx.memberProfilePhoto.deleteMany({ where: { memberId: member.id } });
    if (result.count) {
      await tx.auditLog.create({
        data: {
          actorId: userId,
          entityId: member.id,
          entityType: "Member",
          action: "MEMBER_PROFILE_PHOTO_REMOVED",
        },
      });
    }
    return null;
  });
}
