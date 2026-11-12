import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/server/database/prisma";
import {
  requestPersistentOtp,
  verifyPersistentOtp,
} from "../src/server/auth/otp-persistence-service";
import { hashPassword } from "../src/server/auth/password";
import { consumeRateLimit, privateRateLimitKey } from "../src/server/security/rate-limit";

const run = process.env.RUN_DB_INTEGRATION_TESTS === "1";
let userId = "";
let marker = "";
(run ? describe : describe.skip)(
  "persistent authentication and verification abuse controls",
  () => {
    it("stores only OTP hashes, consumes codes once, commits failed attempts and preserves old contact until verified", async () => {
      marker = crypto.randomUUID();
      const captured: { code: string; destination: string }[] = [];
      vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
      vi.stubEnv("EMAIL_ONLY_PILOT", "");
      vi.stubEnv("EMAIL_PROVIDER", "bridge");
      vi.stubEnv("EMAIL_TRANSPORT_URL", "https://delivery.example.invalid/otp");
      vi.stubEnv("EMAIL_TRANSPORT_TOKEN", "synthetic-test-token");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url, init: RequestInit) => {
          captured.push(JSON.parse(String(init.body)));
          return new Response(null, { status: 204 });
        }),
      );
      const email = `auth-test-${marker}@example.invalid`;
      const user = await prisma.user.create({
        data: {
          email,
          mobile: `+919${(randomBytes(4).readUInt32BE() % 1e9).toString().padStart(9, "0")}`,
          passwordHash: await hashPassword("SyntheticPassword123!"),
        },
      });
      userId = user.id;
      const address = `auth-test-${marker}`;
      const request = { purpose: "LOGIN", channel: "EMAIL", destination: email };
      const login = await requestPersistentOtp(request, address);
      const row = await prisma.otpChallenge.findUniqueOrThrow({
        where: { externalId: login.challengeExternalId },
      });
      const firstCode = captured.at(-1)!.code;
      expect(row.codeHash).not.toContain(firstCode);
      await expect(
        verifyPersistentOtp(
          {
            purpose: "LOGIN",
            challengeExternalId: login.challengeExternalId,
            code: firstCode === "000000" ? "000001" : "000000",
          },
          address,
        ),
      ).rejects.toThrow("invalid");
      expect(
        (await prisma.otpChallenge.findUniqueOrThrow({ where: { id: row.id } })).attempts,
      ).toBe(1);
      const verifyCommand = {
        purpose: "LOGIN",
        challengeExternalId: login.challengeExternalId,
        code: firstCode,
      };
      const concurrent = await Promise.allSettled([
        verifyPersistentOtp(verifyCommand, address),
        verifyPersistentOtp(verifyCommand, address),
      ]);
      expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      await expect(verifyPersistentOtp(verifyCommand, address)).rejects.toThrow("invalid");
      const newEmail = `auth-test-new-${marker}@example.invalid`;
      await expect(
        requestPersistentOtp(
          {
            purpose: "CHANGE_EMAIL",
            channel: "EMAIL",
            destination: newEmail,
            currentPassword: "wrong",
          },
          address,
          user.id,
        ),
      ).rejects.toThrow("Current password");
      const change = await requestPersistentOtp(
        {
          purpose: "CHANGE_EMAIL",
          channel: "EMAIL",
          destination: newEmail,
          currentPassword: "SyntheticPassword123!",
        },
        address,
        user.id,
      );
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(email);
      const changed = await verifyPersistentOtp(
        {
          purpose: "CHANGE_EMAIL",
          challengeExternalId: change.challengeExternalId,
          code: captured.at(-1)!.code,
        },
        address,
        user.id,
      );
      expect(changed.userId).toBe(user.id);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(
        newEmail,
      );
      const expired = await requestPersistentOtp({ ...request, destination: newEmail }, address);
      await prisma.otpChallenge.update({
        where: { externalId: expired.challengeExternalId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(
        verifyPersistentOtp(
          {
            purpose: "LOGIN",
            challengeExternalId: expired.challengeExternalId,
            code: captured.at(-1)!.code,
          },
          address,
        ),
      ).rejects.toThrow("invalid");
      vi.stubEnv("EMAIL_TRANSPORT_URL", "");
      const before = await prisma.otpChallenge.count({ where: { userId: user.id } });
      await expect(
        requestPersistentOtp({ ...request, destination: newEmail }, address),
      ).rejects.toThrow("not configured");
      expect(await prisma.otpChallenge.count({ where: { userId: user.id } })).toBe(before);
      vi.stubEnv("SMS_TRANSPORT_URL", "https://delivery.example.invalid/sms");
      vi.stubEnv("SMS_TRANSPORT_TOKEN", "synthetic-sms-token");
      const mobileRequest = { purpose: "VERIFY_MOBILE", channel: "SMS" };
      const mobileChallenge = await requestPersistentOtp(mobileRequest, address, user.id);
      vi.stubEnv("EMAIL_ONLY_PILOT", "1");
      await expect(requestPersistentOtp(mobileRequest, address, user.id)).rejects.toThrow(
        "not configured",
      );
      await expect(
        verifyPersistentOtp(
          {
            purpose: "VERIFY_MOBILE",
            challengeExternalId: mobileChallenge.challengeExternalId,
            code: captured.at(-1)!.code,
          },
          address,
          user.id,
        ),
      ).rejects.toThrow("invalid");
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).mobileVerifiedAt,
      ).toBeNull();
      const key = privateRateLimitKey("auth-test-limit", marker);
      await consumeRateLimit(key, 1, 60000);
      await expect(consumeRateLimit(key, 1, 60000)).rejects.toThrow("Too many");
    }, 180_000);
  },
);
afterAll(async () => {
  if (!run || !userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  await prisma.otpChallenge.deleteMany({ where: { userId } });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.auditLog.deleteMany({ where: { actorId: userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  const keys = [
    privateRateLimitKey("otp-ip", `auth-test-${marker}`),
    privateRateLimitKey("otp-verify", `auth-test-${marker}`),
    privateRateLimitKey("otp-user", `CHANGE_EMAIL:${userId}`),
    privateRateLimitKey("otp-user", `VERIFY_MOBILE:${userId}`),
    privateRateLimitKey("auth-test-limit", marker),
    privateRateLimitKey("otp-destination", `LOGIN:auth-test-${marker}@example.invalid`),
    privateRateLimitKey("otp-destination", `LOGIN:${user?.email}`),
  ];
  await prisma.loginThrottle.deleteMany({ where: { key: { in: keys } } });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
}, 60_000);
