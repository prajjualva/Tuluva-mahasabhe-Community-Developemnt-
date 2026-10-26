import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../src/server/database/prisma";
import { hashPassword, verifyPassword } from "../src/server/auth/password";
import { assertSessionActive, persistSession, signAccessToken } from "../src/server/auth/session";
import { POST as requestCode } from "../src/app/api/auth/otp/request/route";
import { POST as verifyCode } from "../src/app/api/auth/otp/verify/route";
import { POST as signIn } from "../src/app/api/auth/login/route";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const oldPassword = "SyntheticOldPassword123!";
const newPassword = "SyntheticNewPassword456!";
let userId = "";
let email = "";
let address = "";
const deliveredCodes: string[] = [];
let deliveryFails = false;

function request(path: string, input: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": address },
    body: JSON.stringify(input),
  });
}
async function challenge(purpose = "PASSWORD_RESET", destination = email) {
  const response = await requestCode(
    request("/api/auth/otp/request", { purpose, channel: "EMAIL", destination }),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.accepted).toBe(true);
  expect(Object.keys(body).sort()).toEqual(["accepted", "challengeExternalId"]);
  return body.challengeExternalId as string;
}
function verify(challengeExternalId: string, code: string, password = newPassword) {
  return verifyCode(
    request("/api/auth/otp/verify", {
      purpose: "PASSWORD_RESET",
      challengeExternalId,
      code,
      newPassword: password,
    }),
  );
}

(enabled ? describe : describe.skip)("database-backed password reset API workflow", () => {
  beforeEach(async () => {
    const marker = randomUUID();
    address = `reset-check-${marker}`;
    email = `reset-check-${marker}@example.invalid`;
    deliveredCodes.length = 0;
    deliveryFails = false;
    vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_synthetic-test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@notify.example.org");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init: RequestInit) => {
        if (deliveryFails) return new Response("private-provider-diagnostic", { status: 503 });
        const payload = JSON.parse(String(init.body));
        const code = String(payload.text).match(/code is: (\d{6})/)?.[1];
        if (!code) throw new Error("Synthetic delivery did not contain a code");
        deliveredCodes.push(code);
        return Response.json({ id: randomUUID() });
      }),
    );
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(oldPassword) },
    });
    userId = user.id;
  }, 60_000);

  it("resets once through the real APIs, invalidates sessions/codes, audits, and accepts only the new password", async () => {
    const firstSession = await signAccessToken(userId, []);
    const secondSession = await signAccessToken(userId, []);
    await persistSession(firstSession, userId);
    await persistSession(secondSession, userId);
    await challenge("LOGIN");
    const reset = await challenge();
    const code = deliveredCodes.at(-1)!;
    const stored = await prisma.otpChallenge.findUniqueOrThrow({ where: { externalId: reset } });
    expect(stored.codeHash.includes(code)).toBe(false);

    const responses = await Promise.all([verify(reset, code), verify(reset, code)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    const success = responses.find((response) => response.status === 200)!;
    expect((await success.json()).signInRequired).toBe(true);
    const clearCookie = success.headers.get("set-cookie") ?? "";
    expect(clearCookie.includes("access_token=;")).toBe(true);
    expect(clearCookie.includes("Max-Age=0")).toBe(true);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword(updated.passwordHash!, newPassword)).toBe(true);
    expect(await verifyPassword(updated.passwordHash!, oldPassword)).toBe(false);
    await expect(assertSessionActive(firstSession, userId)).rejects.toThrow("Session expired");
    await expect(assertSessionActive(secondSession, userId)).rejects.toThrow("Session expired");
    expect(await prisma.otpChallenge.count({ where: { userId, consumedAt: null } })).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          actorId: userId,
          action: "OTP_CHALLENGE_VERIFIED",
          afterState: { path: ["purpose"], equals: "PASSWORD_RESET" },
        },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({ where: { userId, title: "Account security updated" } }),
    ).toBe(1);
    expect((await verify(reset, code, "AnotherSyntheticPassword789!")).status).toBe(400);

    const previousLogin = await signIn(
      request("/api/auth/login", { email, password: oldPassword }),
    );
    expect(previousLogin.status).toBe(401);
    expect(previousLogin.headers.has("set-cookie")).toBe(false);
    const newLogin = await signIn(request("/api/auth/login", { email, password: newPassword }));
    expect(newLogin.status).toBe(200);
    expect(newLogin.headers.has("set-cookie")).toBe(true);
  }, 180_000);

  it("commits failed attempts and blocks a correct code after the attempt limit", async () => {
    const reset = await challenge();
    const correct = deliveredCodes.at(-1)!;
    const incorrect = correct === "000000" ? "000001" : "000000";
    for (let attempt = 0; attempt < 5; attempt++)
      expect((await verify(reset, incorrect)).status).toBe(400);
    const stored = await prisma.otpChallenge.findUniqueOrThrow({ where: { externalId: reset } });
    expect(stored.attempts).toBe(5);
    expect((await verify(reset, correct)).status).toBe(400);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword(user.passwordHash!, oldPassword)).toBe(true);
  }, 180_000);

  it("rejects expired codes, wrong purposes and missing/new-password input without changing credentials", async () => {
    const loginChallenge = await challenge("LOGIN");
    expect((await verify(loginChallenge, deliveredCodes.at(-1)!)).status).toBe(400);
    const reset = await challenge();
    const code = deliveredCodes.at(-1)!;
    for (const newValue of [undefined, "short"]) {
      const response = await verifyCode(
        request("/api/auth/otp/verify", {
          purpose: "PASSWORD_RESET",
          challengeExternalId: reset,
          code,
          ...(newValue === undefined ? {} : { newPassword: newValue }),
        }),
      );
      expect(response.status).toBe(400);
    }
    await prisma.otpChallenge.update({
      where: { externalId: reset },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await verify(reset, code)).status).toBe(400);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword(user.passwordHash!, oldPassword)).toBe(true);
  }, 180_000);

  it("hides absent-account existence and fails closed on provider failure", async () => {
    const unknown = await challenge("PASSWORD_RESET", `absent-${randomUUID()}@example.invalid`);
    expect(deliveredCodes.length).toBe(0);
    expect(await prisma.otpChallenge.count({ where: { externalId: unknown } })).toBe(0);
    deliveryFails = true;
    const response = await requestCode(
      request("/api/auth/otp/request", {
        purpose: "PASSWORD_RESET",
        channel: "EMAIL",
        destination: email,
      }),
    );
    expect(response.status).toBe(503);
    const result = JSON.stringify(await response.json());
    expect(result.includes("private-provider-diagnostic")).toBe(false);
    expect(await prisma.otpChallenge.count({ where: { userId, consumedAt: null } })).toBe(0);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword(user.passwordHash!, oldPassword)).toBe(true);
  }, 180_000);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  // The guarded runner drops the entire disposable database. Never remove
  // fixtures from the configured shared development or production database.
  if (enabled) await prisma.$disconnect();
});
