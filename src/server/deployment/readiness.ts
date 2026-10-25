import { otpDeliveryFor } from "../auth/otp-delivery";

type Environment = Record<string, string | undefined>;

/** Configuration-only checks; messages deliberately contain no supplied values. */
export function deploymentReadiness(env: Environment) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const strongSecret = (key: string) => {
    const value = env[key] ?? "";
    if (
      value.length < 32 ||
      new Set(value).size < 8 ||
      /replace|change.me|placeholder|development|set-a-strong/i.test(value)
    )
      errors.push(`${key} must be a new random secret of at least 32 characters.`);
  };
  const https = (key: string) => {
    try {
      const url = new URL(env[key] ?? "");
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
        throw new Error();
    } catch {
      errors.push(`${key} must be a public HTTPS URL without embedded credentials.`);
    }
  };
  strongSecret("AUTH_SECRET");
  strongSecret("CRON_SECRET");
  strongSecret("INTERNAL_JOB_SECRET");
  const secrets = [env.AUTH_SECRET, env.CRON_SECRET, env.INTERNAL_JOB_SECRET].filter(Boolean);
  if (new Set(secrets).size !== secrets.length)
    errors.push("Authentication and job secrets must be distinct.");
  const key = env.BANK_ENCRYPTION_KEY ?? "";
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(key) ||
    Buffer.from(key, "base64").length !== 32 ||
    new Set(Buffer.from(key, "base64")).size < 8
  )
    errors.push("BANK_ENCRYPTION_KEY must be a distinct, securely generated base64 32-byte key.");
  if (key && key === env.AUTH_SECRET)
    errors.push("The bank encryption key must not be reused for authentication.");
  https("APP_URL");
  try {
    const db = new URL(env.DATABASE_URL ?? "");
    if (
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      !["require", "verify-full"].includes(db.searchParams.get("sslmode") ?? "") ||
      /(^|[_-])test([_-]|$)/i.test(db.pathname.slice(1))
    )
      throw new Error();
  } catch {
    errors.push(
      "DATABASE_URL must target the production PostgreSQL database with required TLS, not a test database.",
    );
  }
  if (env.UPLOAD_STORAGE !== "s3") errors.push("Serverless deployment requires UPLOAD_STORAGE=s3.");
  if (!env.S3_PRIVATE_BUCKET || !env.AWS_REGION)
    errors.push("A private S3 bucket and AWS region are required.");
  if (
    env.VERCEL === "1" &&
    !/^arn:aws:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]+$/.test(env.AWS_ROLE_ARN ?? "")
  )
    errors.push("Vercel private storage requires a valid AWS_ROLE_ARN workload role.");
  try {
    if (!otpDeliveryFor("EMAIL", env))
      errors.push("Email delivery requires a configured server-side provider.");
    if (!env.EMAIL_PROVIDER || env.EMAIL_PROVIDER === "bridge") https("EMAIL_TRANSPORT_URL");
    if (env.EMAIL_PROVIDER === "resend") {
      // The gate is a production check even when invoked from a local shell.
      otpDeliveryFor("EMAIL", { ...env, NODE_ENV: "production" });
    }
  } catch {
    errors.push("Email delivery configuration is invalid or missing a verified-domain sender.");
  }
  https("SMS_TRANSPORT_URL");
  if (!env.SMS_TRANSPORT_TOKEN) errors.push("SMS delivery requires a server-side transport token.");
  if (!env.PAYMENT_PROVIDER)
    warnings.push("Online payments are disabled until a real gateway is configured.");
  else if (
    env.PAYMENT_PROVIDER !== "razorpay" ||
    !env.RAZORPAY_KEY_ID ||
    !env.RAZORPAY_KEY_SECRET ||
    !env.RAZORPAY_WEBHOOK_SECRET
  )
    errors.push("The selected payment provider requires its complete Razorpay configuration.");
  return { errors, warnings };
}
