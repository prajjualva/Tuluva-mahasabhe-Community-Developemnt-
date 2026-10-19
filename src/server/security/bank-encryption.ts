import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const bankDetailsSchema = z
  .object({
    accountHolderName: z.string().trim().min(2).max(160),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{6,24}$/),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
  })
  .strict();
const sealedSchema = z
  .object({ version: z.literal(1), iv: z.string(), tag: z.string(), ciphertext: z.string() })
  .strict();
function encryptionKey() {
  const configured = process.env.BANK_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("Bank encryption key must contain 32 bytes");
    return key;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Bank encryption is not configured");
  // Development uses a stable key derived from the local secret, never a plaintext bank record.
  if (!process.env.AUTH_SECRET) throw new Error("Bank encryption is not configured");
  return createHash("sha256")
    .update(`development-bank-encryption:${process.env.AUTH_SECRET}`)
    .digest();
}
export function encryptSensitiveRecord(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from("foundation-sensitive-record-v1"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    version: 1 as const,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}
export function decryptSensitiveRecord(value: unknown): unknown {
  const sealed = sealedSchema.parse(value);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAAD(Buffer.from("foundation-sensitive-record-v1"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
