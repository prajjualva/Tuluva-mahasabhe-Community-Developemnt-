import { createHash } from "node:crypto";
import { prisma } from "../database/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const PUBLIC_DEATH_REPORT_MAX_REQUESTS = 12;

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

/** Public death reporting has its own opaque bucket to prevent report spam. */
export const deathReportThrottleKey = (ip: string) =>
  createHash("sha256").update(`death-report|${ip}`).digest("hex");

export const deathReportSearchThrottleKey = (ip: string) =>
  createHash("sha256").update(`death-report-search|${ip}`).digest("hex");

/**
 * Evidence uploads are a separate public-report surface. Keeping an opaque
 * bucket for them prevents a large upload retry from consuming the intake or
 * search allowance, while still protecting storage from unauthenticated
 * abuse.
 */
export const deathReportEvidenceThrottleKey = (ip: string) =>
  createHash("sha256").update(`death-report-evidence|${ip}`).digest("hex");

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

/**
 * Public death intake/search is intentionally counted even on successful
 * requests, unlike credential failures. Its opaque key prevents member-data
 * enumeration without persisting an IP address.
 */
export async function consumePublicDeathReportRequest(key: string, now = new Date()) {
  const allowed = await prisma.$transaction(async (tx) => {
    const current = await tx.loginThrottle.findUnique({ where: { key } });
    const inWindow = current && now.getTime() - current.windowStartedAt.getTime() < WINDOW_MS;
    const used = inWindow ? current.failures : 0;
    if (current?.lockedUntil && current.lockedUntil > now) return false;
    if (used >= PUBLIC_DEATH_REPORT_MAX_REQUESTS) {
      await tx.loginThrottle.upsert({
        where: { key },
        create: {
          key,
          failures: PUBLIC_DEATH_REPORT_MAX_REQUESTS,
          windowStartedAt: now,
          lockedUntil: new Date(now.getTime() + WINDOW_MS),
        },
        update: { lockedUntil: new Date(now.getTime() + WINDOW_MS) },
      });
      return false;
    }
    await tx.loginThrottle.upsert({
      where: { key },
      create: { key, failures: 1, windowStartedAt: now },
      update: {
        failures: used + 1,
        windowStartedAt: inWindow ? current.windowStartedAt : now,
        lockedUntil: null,
      },
    });
    return true;
  });
  if (!allowed) throw new ThrottleError();
}
