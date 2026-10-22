import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ token: vi.fn(), authorize: vi.fn(), redirect: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.token }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../src/server/http/authorize", () => ({
  requirePermissionForAccessToken: mocks.authorize,
}));
import { requirePagePermission } from "../src/server/http/page-authorize";
describe("role-aware protected page redirects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue({ value: "session" });
    mocks.redirect.mockImplementation((path) => {
      throw new Error(`redirect:${path}`);
    });
  });
  it("keeps a valid but unauthorized Member out of an Admin login loop", async () => {
    mocks.authorize.mockRejectedValue(new Error("Forbidden"));
    await expect(requirePagePermission("admin:*", "/admin")).rejects.toThrow(
      "redirect:/access-denied",
    );
  });
  it("does not suggest a new sign-in can restore suspended Coordinator permissions", async () => {
    mocks.authorize.mockRejectedValue(new Error("Coordinator access is suspended"));
    await expect(
      requirePagePermission("coordinator:members:manage", "/coordinator"),
    ).rejects.toThrow("redirect:/access-denied");
  });
  it("preserves closed membership routing and expired-session sign-in recovery", async () => {
    mocks.authorize
      .mockRejectedValueOnce(new Error("Membership access is closed; contact Foundation Admin"))
      .mockRejectedValueOnce(new Error("Unauthenticated"));
    await expect(requirePagePermission("member:profile:read", "/member")).rejects.toThrow(
      "redirect:/account-unavailable",
    );
    await expect(requirePagePermission("member:profile:read", "/member")).rejects.toThrow(
      "redirect:/login?next=%2Fmember",
    );
  });
  it("returns the authorized principal without changing permissions", async () => {
    const principal = { userId: "member", permissions: new Set(["member:profile:read"]) };
    mocks.authorize.mockResolvedValue(principal);
    expect(await requirePagePermission("member:profile:read", "/member")).toBe(principal);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
