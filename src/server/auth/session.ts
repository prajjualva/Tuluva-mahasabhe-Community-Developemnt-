import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

const sessionSecret = () =>
  new TextEncoder().encode(
    process.env.AUTH_SECRET ?? "development-secret-change-before-deployment",
  );
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
