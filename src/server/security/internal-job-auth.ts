import { timingSafeEqual } from "node:crypto";
import { isReviewWorkspace } from "../deployment/review-environment";

/** Machine-only authentication: no member cookie or URL token can authorize jobs. */
export function isAuthorizedInternalJob(request: { method: string; headers: Headers }) {
  // Review fixtures must never trigger collections, expiry or outbound delivery jobs.
  if (isReviewWorkspace()) return false;
  const cron = request.method === "GET";
  if (!cron && request.method !== "POST") return false;
  const expected = cron ? process.env.CRON_SECRET : process.env.INTERNAL_JOB_SECRET;
  const authorization = request.headers.get("authorization");
  const supplied = cron
    ? authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined
    : request.headers.get("x-internal-job-secret");
  if (!expected || !supplied) return false;
  if (process.env.NODE_ENV === "production" && expected.length < 32) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}
