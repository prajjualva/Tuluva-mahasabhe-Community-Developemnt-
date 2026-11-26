import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filterGuide, platformGuide } from "../src/content/platform-guide";
import { GuideExplorer } from "../src/app/guide/guide-explorer";
import GuidePage from "../src/app/guide/page";
import { requirePagePermission } from "../src/server/http/page-authorize";
import { readPageSession } from "../src/server/http/page-session";

vi.mock("../src/app/components/public-header", () => ({ PublicHeader: () => null }));
vi.mock("../src/server/http/page-authorize", () => ({ requirePagePermission: vi.fn() }));
vi.mock("../src/server/http/page-session", () => ({ readPageSession: vi.fn() }));

afterEach(() => vi.resetAllMocks());

describe("platform guide", () => {
  it("has unique entries with actionable internal destinations and detailed steps", () => {
    expect(new Set(platformGuide.map((entry) => entry.id)).size).toBe(platformGuide.length);
    for (const entry of platformGuide) {
      expect(entry.steps.length).toBeGreaterThanOrEqual(3);
      expect(entry.href).toMatch(/^\/(?!\/)/);
      expect(entry.action.length).toBeGreaterThan(0);
    }
  });
  it("finds tasks across titles, explanations and steps case-insensitively", () => {
    expect(filterGuide("  WALLET  split ", "Member").map((entry) => entry.id)).toContain("wallet");
    expect(filterGuide("unfindable-example-xyz", "Everyone")).toEqual([]);
  });
  it("keeps role guidance distinct while including public safety information", () => {
    const member = filterGuide("", "Member");
    expect(member.some((entry) => entry.audience === "Admin")).toBe(false);
    expect(member.some((entry) => entry.id === "privacy")).toBe(true);
    expect(filterGuide("reconciliation", "Admin").map((entry) => entry.id)).toContain(
      "admin-finance",
    );
  });
  it("explains contribution obligations separately from support eligibility and reactivation", () => {
    expect(platformGuide.find((entry) => entry.id === "contributions")?.steps.join(" ")).toContain(
      "INACTIVE",
    );
    expect(platformGuide.find((entry) => entry.id === "contributions")?.steps.join(" ")).toContain(
      "actual date of death",
    );
    expect(platformGuide.find((entry) => entry.id === "membership")?.note).toContain(
      "does not automatically reactivate",
    );
    expect(platformGuide.find((entry) => entry.id === "plan")?.note).toContain("CLOSED");
  });
  it("renders searchable member guides without exposing the Admin or Coordinator workspace guides", () => {
    const guides = filterGuide("", "Member");
    const html = renderToStaticMarkup(React.createElement(GuideExplorer, { guides }));
    expect(html).toContain('for="guide-search"');
    expect(html).toContain('role="status"');
    expect(html.match(/<details/g)).toHaveLength(guides.length);
    expect(html).not.toContain("Staff workspaces");
    expect(html).not.toContain('href="/coordinator"');
    expect(html).not.toContain('href="/admin#');
  });
  it("renders the member guide and member shortcuts for a signed-in member", async () => {
    vi.mocked(readPageSession).mockResolvedValue({
      userId: "member-test-user",
      dashboard: "/member",
      permissions: new Set(["member:profile:read"]),
      coordinatorActive: false,
      memberUnavailable: false,
      onboardingPaymentRequired: false,
    });
    const html = renderToStaticMarkup(await GuidePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Member guide");
    expect(html).toContain("Open my dashboard");
    expect(html).not.toContain("Create an account and sign in");
    expect(html).not.toContain("Staff workspaces");
  });
  it.each([
    ["admin", "admin:*"],
    ["coordinator", "coordinator:members:manage"],
  ])("checks live permission before returning the %s guide", async (workspace, permission) => {
    const denied = new Error("Forbidden");
    vi.mocked(requirePagePermission).mockRejectedValue(denied);

    await expect(GuidePage({ searchParams: Promise.resolve({ workspace }) })).rejects.toBe(denied);
    expect(requirePagePermission).toHaveBeenCalledWith(permission, `/guide?workspace=${workspace}`);
  });
});
