import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ limit: vi.fn(), user: vi.fn(), sign: vi.fn() }));
vi.mock("../src/server/security/rate-limit", () => ({
  consumeRateLimit: mocks.limit,
  privateRateLimitKey: () => "private-key",
}));
vi.mock("../src/server/database/prisma", () => ({
  prisma: { user: { findUnique: mocks.user } },
}));
vi.mock("../src/server/auth/session", () => ({
  signAccessToken: mocks.sign,
  persistSession: vi.fn(),
}));
vi.mock("../src/server/auth/login-throttle", () => ({
  assertLoginAllowed: vi.fn(),
  clearLoginFailures: vi.fn(),
  recordLoginFailure: vi.fn(),
  clientAddress: () => "local",
  loginThrottleKey: () => "private-key",
  ThrottleError: class ThrottleError extends Error {},
}));
import { POST } from "../src/app/api/auth/login/route";

const request = (body: string) =>
  new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

describe("sign-in failure classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue(undefined);
    mocks.user.mockResolvedValue(null);
  });
  it("keeps invalid input a 400 without querying accounts", async () => {
    expect((await POST(request('{"email":"bad"}'))).status).toBe(400);
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("keeps malformed JSON a 400", async () => {
    expect((await POST(request("{"))).status).toBe(400);
  });
  it("keeps absent accounts indistinguishable from incorrect passwords", async () => {
    const result = await POST(
      request(JSON.stringify({ email: "member@dev.local", password: "incorrect" })),
    );
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: "Invalid email or password" });
  });
  it("fails closed on database failure without leaking diagnostic text", async () => {
    mocks.user.mockRejectedValue(new Error("private database credential diagnostic"));
    const result = await POST(
      request(JSON.stringify({ email: "member@dev.local", password: "incorrect" })),
    );
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private database");
    expect(result.headers.has("set-cookie")).toBe(false);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
