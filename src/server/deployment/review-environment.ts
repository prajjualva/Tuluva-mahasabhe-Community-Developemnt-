type Environment = Record<string, string | undefined>;

export function isReviewWorkspace(env: Environment = process.env) {
  return env.APP_REVIEW_MODE === "1";
}

/** A reviewer deployment is a separate process/database, never a production tenant. */
export function reviewEnvironmentErrors(env: Environment) {
  const errors: string[] = [];
  if (env.APP_REVIEW_MODE && env.APP_REVIEW_MODE !== "1")
    errors.push("APP_REVIEW_MODE must be absent or exactly 1.");
  if (!isReviewWorkspace(env)) {
    try {
      if (
        /^csf_review_test_/.test(
          decodeURIComponent(new URL(env.DATABASE_URL ?? "").pathname.slice(1)),
        )
      )
        errors.push("A reviewer database cannot run without APP_REVIEW_MODE=1.");
    } catch {
      /* Normal database configuration is validated by the deployment gate. */
    }
    return errors;
  }
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !/^csf_review_test_[a-f0-9]{32}$/.test(decodeURIComponent(url.pathname.slice(1))) ||
      (!(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && env.NODE_ENV === "test") &&
        !["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? "")) ||
      (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public")
    )
      throw new Error();
  } catch {
    errors.push(
      "Reviewer access requires a separately provisioned, TLS-protected review database.",
    );
  }
  if (env.RAZORPAY_KEY_ID && !/^rzp_test_[A-Za-z0-9]+$/.test(env.RAZORPAY_KEY_ID))
    errors.push("Reviewer payments require a Razorpay Test Mode key.");
  if (env.PAYMENT_PROVIDER && env.PAYMENT_PROVIDER !== "razorpay")
    errors.push("Reviewer payments require the supported test gateway.");
  if (
    [
      "RESEND_API_KEY",
      "EMAIL_TRANSPORT_TOKEN",
      "SMS_TRANSPORT_TOKEN",
      "SMS_NOTIFICATION_TRANSPORT_TOKEN",
    ].some((key) => Boolean(env[key]))
  )
    errors.push(
      "External email and SMS credentials must not be installed in a reviewer workspace.",
    );
  if (
    env.UPLOAD_STORAGE === "s3" &&
    !/^tuluva-review-[a-z0-9-]+$/.test(env.S3_PRIVATE_BUCKET ?? "")
  )
    errors.push("Reviewer documents require a separate review-only private bucket.");
  return errors;
}

/** Run before constructing any application database client or payment adapter. */
export function assertReviewEnvironment(env: Environment = process.env) {
  if (reviewEnvironmentErrors(env).length)
    throw new Error("Reviewer environment isolation checks failed.");
}
