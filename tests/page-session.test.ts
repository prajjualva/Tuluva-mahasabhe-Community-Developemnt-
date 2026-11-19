import { afterEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { readActiveAccessPrincipal } from "../src/server/http/authorize";
import { readPageSession } from "../src/server/http/page-session";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("../src/server/http/authorize", () => ({ readActiveAccessPrincipal: vi.fn() }));

afterEach(() => vi.resetAllMocks());

function withAccessCookie(value?: string) {
  const get = vi.fn(() => (value ? { name: "access_token", value } : undefined));
  vi.mocked(cookies).mockResolvedValue({ get } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe("signed-in page navigation", () => {
  it("uses guest navigation without an access cookie", async () => {
    withAccessCookie();
    expect(await readPageSession()).toBeNull();
    expect(readActiveAccessPrincipal).not.toHaveBeenCalled();
  });

  it("uses guest navigation after the server rejects a stale session", async () => {
    withAccessCookie("expired");
    vi.mocked(readActiveAccessPrincipal).mockRejectedValue(new Error("Session expired"));
    expect(await readPageSession()).toBeNull();
  });

  it.each([
    { permissions: ["member:profile:read"], active: false, destination: "/member" },
    { permissions: ["admin:*"], active: false, destination: "/admin" },
    {
      permissions: ["member:profile:read", "coordinator:members:manage"],
      active: true,
      destination: "/coordinator",
    },
    {
      permissions: ["member:profile:read", "coordinator:members:manage"],
      active: false,
      destination: "/member",
    },
  ])("returns $destination for the user's live permissions", async (testCase) => {
    withAccessCookie("active");
    vi.mocked(readActiveAccessPrincipal).mockResolvedValue({
      userId: "test-user",
      permissions: new Set(testCase.permissions),
      coordinatorActive: testCase.active,
      coordinatorSuspended: !testCase.active,
      memberUnavailable: false,
    });

    expect((await readPageSession())?.dashboard).toBe(testCase.destination);
  });
});
