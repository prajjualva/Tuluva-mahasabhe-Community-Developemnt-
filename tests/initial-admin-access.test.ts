import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { issueInitialAdminAccess } from "../src/server/auth/initial-admin-access";

vi.mock("../src/server/auth/password", () => ({ hashPassword: vi.fn(async () => "opaque-hash") }));
const input = {
  email: "owner@example.org",
  password: "SyntheticInitialAccess123!",
  reason: "Owner approved first access handoff",
};
const tx = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  userRole: { count: vi.fn() },
  auditLog: { count: vi.fn(), create: vi.fn() },
  authSession: { count: vi.fn(), updateMany: vi.fn() },
  otpChallenge: { updateMany: vi.fn() },
};
const transaction = vi.fn(async (work: (transaction: typeof tx) => unknown) => work(tx));
const database = { $transaction: transaction } as unknown as PrismaClient;
beforeEach(() => {
  vi.clearAllMocks();
  tx.user.findUnique.mockResolvedValue({ id: "internal", externalId: "public", status: "ACTIVE" });
  tx.userRole.count.mockResolvedValue(1);
  tx.auditLog.count.mockImplementation(async ({ where }) =>
    where.action === "INITIAL_ADMIN_BOOTSTRAPPED" ? 1 : 0,
  );
  tx.authSession.count.mockResolvedValue(0);
});
describe("one-time initial Admin handoff", () => {
  it("changes credentials and consumes challenges inside one audited serializable transaction", async () => {
    await issueInitialAdminAccess(database, input);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "internal" },
      data: { passwordHash: "opaque-hash" },
    });
    expect(tx.authSession.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.otpChallenge.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "INITIAL_ADMIN_TEMPORARY_PASSWORD_ISSUED",
          reason: input.reason,
        }),
      }),
    );
    expect(JSON.stringify(tx.auditLog.create.mock.calls).includes(input.password)).toBe(false);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      timeout: 30000,
    });
  });
  it.each([null, { id: "internal", externalId: "public", status: "SUSPENDED" }])(
    "rejects unavailable targets",
    async (user) => {
      tx.user.findUnique.mockResolvedValue(user);
      await expect(issueInitialAdminAccess(database, input)).rejects.toThrow("unavailable");
      expect(tx.user.update).not.toHaveBeenCalled();
    },
  );
  it("refuses additional Admins or missing ownership of the Admin role", async () => {
    tx.userRole.count.mockResolvedValue(0);
    await expect(issueInitialAdminAccess(database, input)).rejects.toThrow("unavailable");
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it("refuses an identity without exactly one original bootstrap", async () => {
    tx.auditLog.count.mockResolvedValue(0);
    await expect(issueInitialAdminAccess(database, input)).rejects.toThrow("unavailable");
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it("never replaces a password after any sign-in", async () => {
    tx.authSession.count.mockResolvedValue(1);
    await expect(issueInitialAdminAccess(database, input)).rejects.toThrow(
      "verified password reset",
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it.each(["INITIAL_ADMIN_TEMPORARY_PASSWORD_ISSUED", "OTP_CHALLENGE_VERIFIED"])(
    "blocks reissue after %s",
    async (action) => {
      tx.auditLog.count.mockImplementation(async ({ where }) =>
        where.action === "INITIAL_ADMIN_BOOTSTRAPPED" || where.action === action ? 1 : 0,
      );
      await expect(issueInitialAdminAccess(database, input)).rejects.toThrow(
        "verified password reset",
      );
      expect(tx.user.update).not.toHaveBeenCalled();
    },
  );
  it("rejects development identities and invalid passwords before a transaction", async () => {
    await expect(
      issueInitialAdminAccess(database, { ...input, email: "admin@dev.local" }),
    ).rejects.toThrow("Development identities");
    await expect(
      issueInitialAdminAccess(database, { ...input, password: "short" }),
    ).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
});
