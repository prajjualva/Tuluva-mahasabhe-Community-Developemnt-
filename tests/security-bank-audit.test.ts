import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bankDetailsSchema,
  encryptSensitiveRecord,
  decryptSensitiveRecord,
} from "../src/server/security/bank-encryption";
import { safeAuditSnapshot } from "../src/server/audit/audit-query-service";

beforeEach(() => {
  vi.stubEnv("BANK_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
});
afterEach(() => {
  vi.unstubAllEnvs();
});
describe("restricted bank storage and safe audit output", () => {
  it("encrypts bank data with a unique IV and authenticates the ciphertext", () => {
    const bank = bankDetailsSchema.parse({
      accountHolderName: "Synthetic nominee",
      accountNumber: "123456789012",
      ifsc: "ABCD0123456",
    });
    const first = encryptSensitiveRecord(bank);
    const second = encryptSensitiveRecord(bank);
    expect(first.iv).not.toBe(second.iv);
    expect(JSON.stringify(first)).not.toContain(bank.accountNumber);
    expect(decryptSensitiveRecord(first)).toEqual(bank);
    const tampered = { ...first, ciphertext: Buffer.from("tampered").toString("base64") };
    expect(() => decryptSensitiveRecord(tampered)).toThrow();
  });
  it("rejects invalid bank details and production without a key", () => {
    expect(
      bankDetailsSchema.safeParse({ accountHolderName: "A", accountNumber: "xxx", ifsc: "wrong" })
        .success,
    ).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BANK_ENCRYPTION_KEY", "");
    expect(() => encryptSensitiveRecord({ test: true })).toThrow("not configured");
  });
  it("removes secrets, bank data and internal identifiers recursively from audit snapshots", () => {
    const safe = safeAuditSnapshot({
      externalId: "safe",
      paymentId: "internal",
      passwordHash: "secret",
      nested: { bankEncrypted: { ciphertext: "secret" }, otp: "123456", value: 36900 },
      requestId: "trace",
    });
    expect(safe).toEqual({ externalId: "safe", nested: { value: 36900 }, requestId: "trace" });
  });
});
