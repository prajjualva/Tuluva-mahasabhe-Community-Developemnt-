import { describe, expect, it } from "vitest";
import {
  verificationFailureMessage,
  VerificationResponseError,
} from "../src/app/components/verification-feedback";

describe("verification connection feedback", () => {
  it.each([
    new TypeError("Failed to fetch private diagnostic"),
    new SyntaxError("private response body"),
    new Error("private infrastructure detail"),
    undefined,
  ])("replaces transport/parser errors with actionable request guidance", (error) => {
    expect(verificationFailureMessage(error, "request")).toBe(
      "Could not connect to the verification service. Please try requesting a code again.",
    );
  });
  it("does not claim a password is unchanged or verification succeeded after an uncertain failure", () => {
    expect(verificationFailureMessage(new TypeError("Failed to fetch"), "verify")).toBe(
      "Could not confirm verification. Try signing in; if needed, request a fresh code and try again.",
    );
  });
  it("preserves the API's controlled expired-code response", () => {
    const message = "Verification code is invalid, expired, or no longer available.";
    expect(verificationFailureMessage(new VerificationResponseError(message), "verify")).toBe(
      message,
    );
  });
});
