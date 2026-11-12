import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deploymentReadiness } from "../src/server/deployment/readiness";
const configuration = () => ({
  AUTH_SECRET: randomBytes(32).toString("hex"),
  CRON_SECRET: randomBytes(32).toString("hex"),
  INTERNAL_JOB_SECRET: randomBytes(32).toString("hex"),
  BANK_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  APP_URL: "https://foundation.example.org",
  DATABASE_URL: "postgresql://app:synthetic@db.example.org/foundation?sslmode=require",
  UPLOAD_STORAGE: "s3",
  S3_PRIVATE_BUCKET: "foundation-private",
  AWS_REGION: "ap-south-1",
  EMAIL_TRANSPORT_URL: "https://delivery.example.org/email",
  EMAIL_TRANSPORT_TOKEN: "synthetic-token",
  SMS_TRANSPORT_URL: "https://delivery.example.org/sms",
  SMS_TRANSPORT_TOKEN: "synthetic-token",
});
describe("deployment readiness configuration", () => {
  it("accepts an explicit email-only pilot without SMS and still requires email delivery", () => {
    const env = {
      ...configuration(),
      EMAIL_ONLY_PILOT: "1",
      SMS_TRANSPORT_URL: "",
      SMS_TRANSPORT_TOKEN: "",
    };
    const result = deploymentReadiness(env);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      "Phone verification and phone-number changes are disabled for the email-only pilot.",
    );
    expect(deploymentReadiness({ ...env, EMAIL_TRANSPORT_TOKEN: "" }).errors).toContain(
      "Email delivery requires a configured server-side provider.",
    );
  });
  it("accepts direct Resend email while retaining all SMS and other production requirements", () => {
    const env = {
      ...configuration(),
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_synthetic-private-token",
      RESEND_FROM_EMAIL: "no-reply@notify.example.org",
      EMAIL_TRANSPORT_URL: "",
      EMAIL_TRANSPORT_TOKEN: "",
    };
    expect(deploymentReadiness(env).errors).toEqual([]);
    expect(deploymentReadiness({ ...env, SMS_TRANSPORT_TOKEN: "" }).errors).toContain(
      "SMS delivery requires a server-side transport token.",
    );
  });
  it("blocks incomplete Resend and test-domain senders without exposing configuration", () => {
    const env = {
      ...configuration(),
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "private-provider-key",
      RESEND_FROM_EMAIL: "onboarding@resend.dev",
    };
    const result = deploymentReadiness(env);
    expect(result.errors).toContain(
      "Email delivery configuration is invalid or missing a verified-domain sender.",
    );
    expect(JSON.stringify(result)).not.toContain(env.RESEND_API_KEY);
    expect(deploymentReadiness({ ...env, RESEND_API_KEY: "" }).errors.length).toBeGreaterThan(0);
    expect(
      deploymentReadiness({ ...env, EMAIL_PROVIDER: "unsupported" }).errors.length,
    ).toBeGreaterThan(0);
  });
  it("allows complete non-payment configuration but explicitly warns online payments are disabled", () => {
    const result = deploymentReadiness(configuration());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });
  it("fails closed for missing configuration without exposing supplied values", () => {
    const result = deploymentReadiness({ DATABASE_URL: "private-invalid-diagnostic" });
    expect(result.errors.length).toBeGreaterThan(5);
    expect(JSON.stringify(result)).not.toContain("private-invalid-diagnostic");
  });
  it("rejects reused or placeholder secrets and weak encryption keys", () => {
    const env = configuration();
    env.AUTH_SECRET = env.CRON_SECRET;
    env.BANK_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    expect(deploymentReadiness(env).errors).toHaveLength(2);
  });
  it("blocks insecure public URLs, test databases and ephemeral serverless documents", () => {
    const env = configuration();
    env.APP_URL = "http://localhost:3000";
    env.DATABASE_URL = "postgresql://localhost/csf_test?sslmode=require";
    env.UPLOAD_STORAGE = "local";
    expect(deploymentReadiness(env).errors).toHaveLength(3);
  });
  it("does not accept a half-configured or unsupported payment gateway", () => {
    expect(
      deploymentReadiness({ ...configuration(), PAYMENT_PROVIDER: "fake" }).errors,
    ).toHaveLength(1);
    expect(
      deploymentReadiness({ ...configuration(), PAYMENT_PROVIDER: "razorpay" }).errors,
    ).toHaveLength(1);
  });
  it("requires a workload role on Vercel without exposing invalid role values", () => {
    const env = { ...configuration(), VERCEL: "1", AWS_ROLE_ARN: "private-invalid-value" };
    const result = deploymentReadiness(env);
    expect(result.errors).toContain(
      "Vercel private storage requires a valid AWS_ROLE_ARN workload role.",
    );
    expect(JSON.stringify(result)).not.toContain("private-invalid-value");
    env.AWS_ROLE_ARN = "arn:aws:iam::123456789012:role/private-documents";
    expect(deploymentReadiness(env).errors).toEqual([]);
  });
});
