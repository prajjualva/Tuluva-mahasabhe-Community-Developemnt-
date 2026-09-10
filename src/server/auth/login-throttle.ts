import { createHash } from "node:crypto";
import { prisma } from "../database/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export class ThrottleError extends Error {
  constructor() {
    super("Too many attempts. Try again later.");
    this.name = "ThrottleError";
  }
}

export const loginThrottleKey = (email: string, ip: string) =>
  createHash("sha256").update(`${email.trim().toLowerCase()}|${ip}`).digest("hex");

/**
 * Public registration has its own opaque key so a burst of invalid sign-in
 * attempts cannot block a legitimate account creation, and no raw IP address
 * is persisted.
 */
export const registrationThrottleKey = (ip: string) =>
  createHash("sha256").update(`registration|${ip}`).digest("hex");

export function clientAddress(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || headers.get("x-real-ip") || "local").slice(0, 128);
}

export async function assertLoginAllowed(key: string, now = new Date()) {
  const current = await prisma.loginThrottle.findUnique({
    where: { key },
    select: { lockedUntil: true },
  });
  if (current?.lockedUntil && current.lockedUntil > now) throw new ThrottleError();
}

export async function recordLoginFailure(key: string, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.loginThrottle.findUnique({ where: { key } });
    const inWindow = current && now.getTime() - current.windowStartedAt.getTime() < WINDOW_MS;
    const failures = (inWindow ? current.failures : 0) + 1;
    await tx.loginThrottle.upsert({
      where: { key },
      create: {
        key,
        failures,
        windowStartedAt: now,
        lockedUntil: failures >= MAX_FAILURES ? new Date(now.getTime() + WINDOW_MS) : null,
      },
      update: {
        failures,
        windowStartedAt: inWindow ? current.windowStartedAt : now,
        lockedUntil: failures >= MAX_FAILURES ? new Date(now.getTime() + WINDOW_MS) : null,
      },
    });
  });
}

export async function clearLoginFailures(key: string) {
  await prisma.loginThrottle.deleteMany({ where: { key } });
}
