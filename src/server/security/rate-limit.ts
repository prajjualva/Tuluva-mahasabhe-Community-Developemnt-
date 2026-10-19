import { createHash } from "node:crypto";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import { ThrottleError } from "../auth/login-throttle";

export const privateRateLimitKey = (scope: string, identity: string) =>
  createHash("sha256").update(`${scope}:${identity}`).digest("hex");
export async function consumeRateLimit(
  key: string,
  limit: number,
  intervalMs: number,
  now = new Date(),
) {
  const allowed = await runSerializablePaymentTransaction(async (tx) => {
    const prior = await tx.loginThrottle.findUnique({ where: { key } });
    const inWindow = prior && now.getTime() - prior.windowStartedAt.getTime() < intervalMs;
    if (inWindow && prior.failures >= limit) return false;
    await tx.loginThrottle.upsert({
      where: { key },
      create: { key, failures: 1, windowStartedAt: now },
      update: {
        failures: inWindow ? prior.failures + 1 : 1,
        windowStartedAt: inWindow ? prior.windowStartedAt : now,
        lockedUntil: null,
      },
    });
    return true;
  });
  if (!allowed) throw new ThrottleError();
}
