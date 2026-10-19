import { describe, expect, it } from "vitest";
import { safeLogValue } from "../src/server/logging/safe-log";
describe("sensitive diagnostic logging", () => {
  it("recursively removes authentication, bank and evidence fields", () => {
    const value = safeLogValue({
      requestId: "public-request",
      payload: [
        {
          password: "do-not-log",
          bankEncrypted: { ciphertext: "bank-secret" },
          otpCode: "123456",
          accessToken: "credential",
        },
      ],
      evidenceBytes: new Uint8Array([1, 2]),
    });
    expect(JSON.stringify(value)).not.toMatch(/do-not-log|bank-secret|123456|credential/);
    expect(value).toMatchObject({ requestId: "public-request", evidenceBytes: "[REDACTED]" });
  });
  it("does not serialize database or provider exception messages", () => {
    const value = safeLogValue({ err: new Error("postgresql://secret:password@database") });
    expect(JSON.stringify(value)).not.toContain("postgresql:");
  });
});
