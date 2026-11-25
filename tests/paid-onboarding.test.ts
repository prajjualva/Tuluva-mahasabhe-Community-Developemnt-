import { describe, expect, it } from "vitest";
import {
  needsInitialMembershipPayment,
  onboardingPathAllowed,
} from "../src/server/members/paid-onboarding";
import { readBoundedBody } from "../src/server/http/bounded-body";

describe("initial membership access policy", () => {
  const pending = {
    registrationDueId: "initial-due",
    registrationDue: { status: "PENDING", payments: [] },
  };
  it("gates new accounts until a settled unrefunded initial payment, while preserving existing accounts", () => {
    expect(needsInitialMembershipPayment(pending)).toBe(true);
    expect(
      needsInitialMembershipPayment({
        ...pending,
        registrationDue: { status: "PAID", payments: [] },
      }),
    ).toBe(true);
    expect(
      needsInitialMembershipPayment({
        ...pending,
        registrationDue: { status: "PAID", payments: [{}] },
      }),
    ).toBe(false);
    expect(
      needsInitialMembershipPayment({
        ...pending,
        registrationDue: { status: "WAIVED", payments: [] },
      }),
    ).toBe(true);
    expect(
      needsInitialMembershipPayment({ ...pending, coordinatorProfile: { status: "SUSPENDED" } }),
    ).toBe(false);
    expect(needsInitialMembershipPayment({ registrationDueId: null })).toBe(false);
    expect(needsInitialMembershipPayment({ ...pending, membershipGrants: [{}] })).toBe(false);
  });
  it("allows payment recovery, verification and deletion without unlocking member APIs", () => {
    expect(onboardingPathAllowed("/api/member/onboarding", "GET")).toBe(true);
    expect(onboardingPathAllowed("/api/member/payments", "POST")).toBe(true);
    expect(onboardingPathAllowed("/api/auth/otp/verify", "POST")).toBe(true);
    expect(onboardingPathAllowed("/api/account/deletion", "POST")).toBe(true);
    expect(
      onboardingPathAllowed(
        "/api/member/payments/00000000-0000-4000-8000-000000000000/resume",
        "POST",
      ),
    ).toBe(true);
    for (const route of [
      "/api/member/news",
      "/api/member/profile",
      "/api/member/plan",
      "/api/member/wallet",
      "/api/member/payments/history",
    ])
      expect(onboardingPathAllowed(route, "GET")).toBe(false);
  });
  it("limits actual streamed upload bytes, including requests without content-length", async () => {
    await expect(
      readBoundedBody(
        new Request("https://app.example/register", { method: "POST", body: "oversize" }),
        4,
      ),
    ).rejects.toThrow("too large");
    expect(
      (
        await readBoundedBody(
          new Request("https://app.example/register", { method: "POST", body: "photo" }),
          5,
        )
      ).toString(),
    ).toBe("photo");
  });
});
