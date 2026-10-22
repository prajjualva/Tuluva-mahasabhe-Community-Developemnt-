import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedInternalJob } from "../src/server/security/internal-job-auth";

afterEach(() => vi.unstubAllEnvs());
const request = (method: string, headers: Record<string, string> = {}) => ({
  method,
  headers: new Headers(headers),
});
describe("machine job authentication", () => {
  it("allows Vercel GET only with the exact bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect(isAuthorizedInternalJob(request("GET", { authorization: "Bearer cron-secret" }))).toBe(
      true,
    );
    for (const value of ["cron-secret", "Basic cron-secret", "Bearer wrong", "Bearer "])
      expect(isAuthorizedInternalJob(request("GET", { authorization: value }))).toBe(false);
  });
  it("preserves POST scheduler authentication without accepting cookie or cron credentials", () => {
    vi.stubEnv("INTERNAL_JOB_SECRET", "post-secret");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect(
      isAuthorizedInternalJob(request("POST", { "x-internal-job-secret": "post-secret" })),
    ).toBe(true);
    expect(
      isAuthorizedInternalJob(
        request("POST", { authorization: "Bearer cron-secret", cookie: "access_token=anything" }),
      ),
    ).toBe(false);
    expect(
      isAuthorizedInternalJob(request("GET", { "x-internal-job-secret": "post-secret" })),
    ).toBe(false);
  });
  it("fails closed for missing config, missing credentials and unsupported methods", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isAuthorizedInternalJob(request("GET"))).toBe(false);
    expect(isAuthorizedInternalJob(request("DELETE"))).toBe(false);
  });
  it("rejects short production secrets and safely compares differing UTF-8 lengths", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "short");
    expect(isAuthorizedInternalJob(request("GET", { authorization: "Bearer short" }))).toBe(false);
    vi.stubEnv("CRON_SECRET", "a".repeat(32));
    expect(
      isAuthorizedInternalJob(request("GET", { authorization: `Bearer ${"a".repeat(32)}` })),
    ).toBe(true);
    expect(
      isAuthorizedInternalJob(request("GET", { authorization: `Bearer ${"é".repeat(32)}` })),
    ).toBe(false);
  });
});
