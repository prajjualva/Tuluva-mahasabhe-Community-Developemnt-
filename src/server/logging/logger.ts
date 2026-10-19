import pino from "pino";
import { safeLogValue } from "./safe-log";
export const logger = pino({
  hooks: {
    logMethod(args, method) {
      method.apply(this, args.map((value) => safeLogValue(value)) as typeof args);
    },
  },
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "password",
    "passwordHash",
    "otp",
    "authorization",
    "cookie",
    "bankEncrypted",
    "*.bankEncrypted",
  ],
});
