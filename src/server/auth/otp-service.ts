import { createOtp, hashOtp } from "./otp";

export const OTP_EXPIRY_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_REQUESTS_PER_HOUR = 5;
export type OtpRecord = {
  destination: string;
  purpose: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt?: Date;
};
export function issueOtp(
  destination: string,
  purpose: string,
  secret: string,
  recentRequests: number,
  now = new Date(),
) {
  if (recentRequests >= OTP_MAX_REQUESTS_PER_HOUR)
    throw new Error("OTP request rate limit exceeded");
  const code = createOtp();
  return {
    code,
    record: {
      destination,
      purpose,
      codeHash: hashOtp(code, secret),
      expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
      attempts: 0,
    } satisfies OtpRecord,
  };
}
export function verifyOtp(record: OtpRecord, code: string, secret: string, now = new Date()): void {
  if (record.consumedAt || record.expiresAt <= now) throw new Error("OTP expired or already used");
  if (record.attempts >= OTP_MAX_ATTEMPTS) throw new Error("OTP attempts exceeded");
  if (record.codeHash !== hashOtp(code, secret)) {
    record.attempts += 1;
    throw new Error("Invalid OTP");
  }
  record.consumedAt = now;
}
