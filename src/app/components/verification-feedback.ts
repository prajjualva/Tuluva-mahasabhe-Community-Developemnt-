export class VerificationResponseError extends Error {}

/** Never render raw network/parser diagnostics or claim an uncertain reset succeeded. */
export function verificationFailureMessage(error: unknown, phase: "request" | "verify") {
  if (error instanceof VerificationResponseError) return error.message;
  return phase === "request"
    ? "Could not connect to the verification service. Please try requesting a code again."
    : "Could not confirm verification. Try signing in; if needed, request a fresh code and try again.";
}
