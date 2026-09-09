import { createHash } from "node:crypto";
import { prisma } from "../database/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
export const loginThrottleKey = (email: string, ip: string) =>
  createHash("sha256").update(`${email.trim().toLowerCase()}|${ip}`).digest("hex");

export async function assertLoginAllowed(key: string, now = new Date()) {
  const current = await prisma.loginThrottle.findUnique({
    where: { key },
    select: { lockedUntil: true },
  });
  if (current?.lockedUntil && current.lockedUntil > now)
    throw new Error("Too many sign-in attempts. Try again later.");
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
