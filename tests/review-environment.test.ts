import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertReviewEnvironment,
  reviewEnvironmentErrors,
} from "../src/server/deployment/review-environment";
import { getPaymentProvider } from "../src/server/payments/payment-provider";
import { notificationTransport } from "../src/server/notifications/notification-delivery-provider";
import { otpDeliveryFor } from "../src/server/auth/otp-delivery";
import { isAuthorizedInternalJob } from "../src/server/security/internal-job-auth";
import {
  officialReceiptHtml,
  officialReceiptShareText,
} from "../src/server/payments/receipt-document";
import { deploymentReadiness } from "../src/server/deployment/readiness";
import { randomBytes } from "node:crypto";
import { reviewPortalUrl } from "../src/server/deployment/review-portal";

afterEach(() => vi.unstubAllEnvs());
const review = () => ({
  APP_REVIEW_MODE: "1",
  DATABASE_URL: `postgresql://sample:secret@db.example.invalid/csf_review_test_${"a".repeat(32)}?sslmode=require`,
  PAYMENT_PROVIDER: "razorpay",
  RAZORPAY_KEY_ID: "rzp_test_Synthetic",
  RAZORPAY_KEY_SECRET: "synthetic-secret",
  RAZORPAY_WEBHOOK_SECRET: "synthetic-webhook",
});
describe("isolated reviewer environment", () => {
  it("allows only the configured reviewer origin without forwarding tokens or arbitrary redirects", () => {
    expect(
      reviewPortalUrl({ PLAY_REVIEW_URL: "https://tuluva-mahasabhe-review.vercel.app/" }),
    ).toBe("https://tuluva-mahasabhe-review.vercel.app/login");
    for (const candidate of [
      "http://review.tuluworld.org.in/",
      "https://attacker.example/",
      "https://tuluva-mahasabhe.vercel.app/",
      "https://review.tuluworld.org.in/?token=private",
      "https://user:private@review.tuluworld.org.in/",
      "https://review.tuluworld.org.in/login",
      "https://review.tuluworld.org.in:444/",
      "https://review.tuluworld.org.in/#private",
    ]) {
      expect(reviewPortalUrl({ PLAY_REVIEW_URL: candidate })).toBeNull();
    }
    expect(reviewPortalUrl({})).toBeNull();
  });
  it("leaves ordinary runtime configuration unchanged and rejects ambiguous mode flags", () => {
    expect(reviewEnvironmentErrors({})).toEqual([]);
    expect(reviewEnvironmentErrors({ APP_REVIEW_MODE: "true" })).toHaveLength(1);
    expect(() => assertReviewEnvironment({ DATABASE_URL: review().DATABASE_URL })).toThrow();
  });
  it("refuses application databases, alternate schemas and missing TLS without printing secrets", () => {
    for (const url of [
      "postgresql://private@db/neondb?sslmode=require",
      "postgresql://private@db/csf_test?sslmode=require",
      review().DATABASE_URL.replace("require", "disable"),
      `${review().DATABASE_URL}&schema=production`,
    ]) {
      const env = { ...review(), DATABASE_URL: url };
      expect(() => assertReviewEnvironment(env)).toThrow("isolation checks failed");
      expect(JSON.stringify(reviewEnvironmentErrors(env))).not.toContain("private@");
    }
  });
  it("never constructs a live provider or issues a request from the review workspace", () => {
    const request = vi.fn();
    expect(() =>
      getPaymentProvider({ ...review(), RAZORPAY_KEY_ID: "rzp_live_Synthetic" }, request),
    ).toThrow();
    expect(request).not.toHaveBeenCalled();
    expect(getPaymentProvider(review(), request).available).toBe(true);
  });
  it("rejects live messaging credentials and the live document bucket", () => {
    for (const key of [
      "RESEND_API_KEY",
      "EMAIL_TRANSPORT_TOKEN",
      "SMS_TRANSPORT_TOKEN",
      "SMS_NOTIFICATION_TRANSPORT_TOKEN",
    ]) {
      expect(reviewEnvironmentErrors({ ...review(), [key]: "private-key" })).toHaveLength(1);
    }
    expect(
      reviewEnvironmentErrors({
        ...review(),
        UPLOAD_STORAGE: "s3",
        S3_PRIVATE_BUCKET: "foundation-live",
      }),
    ).toHaveLength(1);
    expect(
      reviewEnvironmentErrors({
        ...review(),
        UPLOAD_STORAGE: "s3",
        S3_PRIVATE_BUCKET: "tuluva-review-sample",
      }),
    ).toEqual([]);
  });
  it("disables outbound transport even when a caller supplies credentials", () => {
    const env = {
      ...review(),
      RESEND_API_KEY: "synthetic",
      RESEND_FROM_EMAIL: "sender@example.org",
    };
    expect(otpDeliveryFor("EMAIL", env)).toBeNull();
    expect(otpDeliveryFor("SMS", env)).toBeNull();
    expect(notificationTransport("EMAIL", env)).toBeNull();
    expect(notificationTransport("SMS", env)).toBeNull();
  });
  it("refuses both cron and internal job credentials in the review workspace", () => {
    vi.stubEnv("APP_REVIEW_MODE", "1");
    vi.stubEnv("CRON_SECRET", "exact");
    vi.stubEnv("INTERNAL_JOB_SECRET", "exact");
    expect(
      isAuthorizedInternalJob({
        method: "GET",
        headers: new Headers({ authorization: "Bearer exact" }),
      }),
    ).toBe(false);
    expect(
      isAuthorizedInternalJob({
        method: "POST",
        headers: new Headers({ "x-internal-job-secret": "exact" }),
      }),
    ).toBe(false);
  });
  it("keeps TEST watermarks on downloaded and shared receipts outside the workspace", () => {
    const receipt = {
      receiptNumber: "TEST-RCP-2026-SAMPLE",
      issuedAt: new Date("2026-11-24"),
      amountPaise: 10_000,
      method: "WALLET",
      status: "SUCCEEDED",
      providerReference: null,
      paymentExternalId: crypto.randomUUID(),
      member: null,
      due: null,
    };
    expect(officialReceiptHtml(receipt)).toContain("no monetary value");
    expect(officialReceiptShareText(receipt)).toContain("no real money");
    expect(officialReceiptHtml({ ...receipt, receiptNumber: "RCP-2026-LIVE" })).toContain(
      "Official payment receipt",
    );
  });
  it("requires complete test gateway and independent serverless storage for deployment", () => {
    const env = {
      ...review(),
      AUTH_SECRET: randomBytes(32).toString("hex"),
      CRON_SECRET: randomBytes(32).toString("hex"),
      INTERNAL_JOB_SECRET: randomBytes(32).toString("hex"),
      BANK_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      APP_URL: "https://tuluva-review.example.org",
      UPLOAD_STORAGE: "s3",
      S3_PRIVATE_BUCKET: "tuluva-review-sample",
      AWS_REGION: "ap-south-2",
    };
    expect(deploymentReadiness(env).errors).toEqual([]);
    expect(deploymentReadiness({ ...env, PAYMENT_PROVIDER: "" }).errors).toHaveLength(1);
    expect(deploymentReadiness({ ...env, APP_REVIEW_MODE: "" }).errors.length).toBeGreaterThan(0);
  });
});
