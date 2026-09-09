import { createHash, randomInt } from "node:crypto";
export const createOtp = (): string => randomInt(100000, 1000000).toString();
export const hashOtp = (otp: string, secret: string): string =>
  createHash("sha256").update(`${secret}:${otp}`).digest("hex");
/** Persist only this hash with expiry and attempt counter; never log or persist the plaintext OTP. */
