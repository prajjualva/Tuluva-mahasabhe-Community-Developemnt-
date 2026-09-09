import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "../database/prisma";

const sessionSecret = () => {
  const configured = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && (!configured || configured.length < 32))
    throw new Error("AUTH_SECRET must be at least 32 characters in production");
  return new TextEncoder().encode(configured ?? "development-secret-change-before-deployment");
};
export const hashSessionToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const createSessionToken = () => randomBytes(32).toString("base64url");
export async function signAccessToken(userId: string, permissions: string[]) {
  return new SignJWT({ permissions })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(sessionSecret());
}
export async function verifyAccessToken(token: string) {
  const verified = await jwtVerify(token, sessionSecret());
  return {
    userId: verified.payload.sub!,
    permissions: new Set((verified.payload.permissions as string[] | undefined) ?? []),
  };
}

export async function persistSession(token: string, userId: string, userAgent?: string | null) {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgentHash: userAgent ? createHash("sha256").update(userAgent).digest("hex") : undefined,
    },
  });
  return expiresAt;
}

export async function assertSessionActive(token: string, userId: string) {
  const session = await prisma.authSession.findFirst({
    where: {
      userId,
      tokenHash: hashSessionToken(token),
      invalidatedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!session) throw new Error("Session expired");
}

export async function invalidateSession(token: string) {
  await prisma.authSession.updateMany({
    where: { tokenHash: hashSessionToken(token), invalidatedAt: null },
    data: { invalidatedAt: new Date() },
  });
}
