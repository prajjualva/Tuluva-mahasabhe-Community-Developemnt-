import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "../database/prisma";
import { createOtp, hashOtp } from "./otp";
import { hashPassword, verifyPassword } from "./password";
import { OTP_EXPIRY_MS, OTP_MAX_ATTEMPTS, OTP_MAX_REQUESTS_PER_HOUR } from "./otp-service";
import { consumeRateLimit, privateRateLimitKey } from "../security/rate-limit";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { isEmailOnlyPilot, otpDeliveryFor } from "./otp-delivery";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";

export const otpPurposeSchema = z.enum([
  "LOGIN",
  "PASSWORD_RESET",
  "VERIFY_EMAIL",
  "VERIFY_MOBILE",
  "CHANGE_EMAIL",
  "CHANGE_MOBILE",
]);
export const otpRequestSchema = z
  .object({
    purpose: otpPurposeSchema,
    channel: z.enum(["EMAIL", "SMS"]),
    destination: z.string().trim().max(254).optional(),
    currentPassword: z.string().max(128).optional(),
  })
  .strict();
export const otpVerifySchema = z
  .object({
    purpose: otpPurposeSchema,
    challengeExternalId: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/),
    newPassword: z.string().min(12).max(128).optional(),
  })
  .strict();
export const isPublicOtpPurpose = (purpose: string) =>
  purpose === "LOGIN" || purpose === "PASSWORD_RESET";
function otpSecret(challengeExternalId: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Verification security is not configured");
  return `${secret}:${challengeExternalId}`;
}

export async function requestPersistentOtp(input: unknown, address: string, actorId?: string) {
  const command = otpRequestSchema.parse(input);
  await consumeRateLimit(privateRateLimitKey("otp-ip", address), 15, 3600000);
  const delivery = otpDeliveryFor(command.channel);
  if (!delivery) throw new Error("Verification delivery is not configured");
  let destination = command.destination ?? "";
  let user;
  if (isPublicOtpPurpose(command.purpose)) {
    destination =
      command.channel === "EMAIL"
        ? z.string().email().parse(destination).toLowerCase()
        : z
            .string()
            .regex(/^\+[1-9]\d{7,14}$/)
            .parse(destination);
    await consumeRateLimit(
      privateRateLimitKey("otp-destination", `${command.purpose}:${destination}`),
      OTP_MAX_REQUESTS_PER_HOUR,
      3600000,
    );
    user = await prisma.user.findFirst({
      where: {
        ...(command.channel === "EMAIL" ? { email: destination } : { mobile: destination }),
        status: "ACTIVE",
      },
    });
  } else {
    if (!actorId) throw new Error("Unauthenticated");
    user = await prisma.user.findUnique({ where: { id: actorId } });
    if (!user || user.status !== "ACTIVE") throw new Error("Unauthenticated");
    const emailPurpose = command.purpose.endsWith("EMAIL");
    if ((emailPurpose ? "EMAIL" : "SMS") !== command.channel)
      throw new Error("Verification channel does not match its purpose");
    if (command.purpose.startsWith("CHANGE_")) {
      if (
        !command.currentPassword ||
        !user.passwordHash ||
        !(await verifyPassword(user.passwordHash, command.currentPassword))
      )
        throw new Error("Current password is required to change contact details");
      destination = emailPurpose
        ? z.string().email().parse(destination).toLowerCase()
        : z
            .string()
            .regex(/^\+[1-9]\d{7,14}$/)
            .parse(destination);
      const duplicate = await prisma.user.findFirst({
        where: {
          id: { not: user.id },
          OR: emailPurpose
            ? [{ email: destination }, { pendingEmail: destination }]
            : [{ mobile: destination }, { pendingMobile: destination }],
        },
        select: { id: true },
      });
      if (duplicate) throw new Error("Contact details are unavailable");
    } else destination = (emailPurpose ? user.email : user.mobile) ?? "";
    if (!destination) throw new Error("Contact details are unavailable");
    await consumeRateLimit(
      privateRateLimitKey("otp-user", `${command.purpose}:${user.id}`),
      OTP_MAX_REQUESTS_PER_HOUR,
      3600000,
    );
  }
  const externalId = randomUUID();
  if (!user) return { accepted: true, challengeExternalId: externalId };
  const code = createOtp();
  const secret = otpSecret(externalId);
  const userId = user.id;
  await runSerializablePaymentTransaction(async (tx) => {
    await tx.otpChallenge.updateMany({
      where: { userId, purpose: command.purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (command.purpose === "CHANGE_EMAIL")
      await tx.user.update({ where: { id: userId }, data: { pendingEmail: destination } });
    if (command.purpose === "CHANGE_MOBILE")
      await tx.user.update({ where: { id: userId }, data: { pendingMobile: destination } });
    await tx.otpChallenge.create({
      data: {
        externalId,
        userId,
        destination,
        purpose: command.purpose,
        codeHash: hashOtp(code, secret),
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "OTP_CHALLENGE_REQUESTED",
        entityType: "User",
        entityId: userId,
        afterState: { purpose: command.purpose, channel: command.channel },
      },
    });
  });
  try {
    await delivery.send({
      destination,
      code,
      purpose: command.purpose,
      expiresInSeconds: OTP_EXPIRY_MS / 1000,
    });
  } catch {
    await prisma.otpChallenge.updateMany({
      where: { externalId },
      data: { consumedAt: new Date() },
    });
    throw new Error("Verification delivery failed");
  }
  return { accepted: true, challengeExternalId: externalId };
}

export async function verifyPersistentOtp(input: unknown, address: string, actorId?: string) {
  const command = otpVerifySchema.parse(input);
  await consumeRateLimit(privateRateLimitKey("otp-verify", address), 30, 15 * 60000);
  if (command.purpose === "PASSWORD_RESET" && !command.newPassword)
    throw new Error("A new password is required");
  const passwordHash = command.newPassword ? await hashPassword(command.newPassword) : undefined;
  const outcome = await runSerializablePaymentTransaction(async (tx) => {
    const challenge = await tx.otpChallenge.findUnique({
      where: { externalId: command.challengeExternalId },
      include: { user: true },
    });
    const now = new Date();
    if (
      !challenge ||
      !challenge.user ||
      challenge.user.status !== "ACTIVE" ||
      challenge.purpose !== command.purpose ||
      (isEmailOnlyPilot() &&
        (command.purpose.endsWith("MOBILE") ||
          (isPublicOtpPurpose(command.purpose) &&
            challenge.destination !== challenge.user.email))) ||
      (!isPublicOtpPurpose(command.purpose) && challenge.userId !== actorId) ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= OTP_MAX_ATTEMPTS
    )
      return { error: "Verification code is invalid or expired" } as const;
    if (
      (command.purpose === "VERIFY_EMAIL" && challenge.destination !== challenge.user.email) ||
      (command.purpose === "VERIFY_MOBILE" && challenge.destination !== challenge.user.mobile) ||
      (isPublicOtpPurpose(command.purpose) &&
        challenge.destination !== challenge.user.email &&
        challenge.destination !== challenge.user.mobile)
    )
      return { error: "Verification code is invalid or expired" } as const;
    const expected = Buffer.from(challenge.codeHash, "hex");
    const supplied = Buffer.from(hashOtp(command.code, otpSecret(challenge.externalId)), "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      return { error: "Verification code is invalid or expired" } as const;
    }
    const claimed = await tx.otpChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        attempts: { lt: OTP_MAX_ATTEMPTS },
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) return { error: "Verification code is invalid or expired" } as const;
    const userId = challenge.user.id;
    if (command.purpose === "VERIFY_EMAIL")
      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
    if (command.purpose === "VERIFY_MOBILE")
      await tx.user.update({ where: { id: userId }, data: { mobileVerifiedAt: now } });
    if (command.purpose === "CHANGE_EMAIL") {
      if (challenge.user.pendingEmail !== challenge.destination)
        return { error: "Contact change was superseded" } as const;
      await tx.user.update({
        where: { id: userId },
        data: { email: challenge.destination, pendingEmail: null, emailVerifiedAt: now },
      });
    }
    if (command.purpose === "CHANGE_MOBILE") {
      if (challenge.user.pendingMobile !== challenge.destination)
        return { error: "Contact change was superseded" } as const;
      await tx.user.update({
        where: { id: userId },
        data: { mobile: challenge.destination, pendingMobile: null, mobileVerifiedAt: now },
      });
    }
    if (command.purpose === "PASSWORD_RESET")
      await tx.user.update({ where: { id: userId }, data: { passwordHash: passwordHash! } });
    if (command.purpose.startsWith("CHANGE_") || command.purpose === "PASSWORD_RESET") {
      await tx.otpChallenge.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.authSession.updateMany({
        where: { userId, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
      await createInAppNotificationInTransaction(tx, {
        userId,
        type: "SYSTEM",
        title: "Account security updated",
        body: "Your Foundation account contact or password was changed after verification. Previous sessions were signed out. Contact the Foundation immediately if you did not request this.",
        relatedExternalId: challenge.user.externalId,
        idempotencyKey: `account-change:${challenge.externalId}`,
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "OTP_CHALLENGE_VERIFIED",
        entityType: "User",
        entityId: userId,
        afterState: { purpose: command.purpose },
      },
    });
    return { userId, purpose: command.purpose } as const;
  });
  if ("error" in outcome) throw new Error(outcome.error);
  return outcome;
}
