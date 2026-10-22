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
});
