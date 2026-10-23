import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { filterGuide, platformGuide } from "../src/content/platform-guide";
import { GuideExplorer } from "../src/app/guide/guide-explorer";

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
  it("renders labelled search, pressed filter states and native keyboard-operable answers", () => {
    const html = renderToStaticMarkup(React.createElement(GuideExplorer));
    expect(html).toContain('for="guide-search"');
    expect(html).toContain('role="group" aria-label="Guide audience"');
    expect(html).toContain('aria-pressed="true">All guides');
    expect(html).toContain('role="status"');
    expect(html.match(/<details/g)).toHaveLength(platformGuide.length);
  });
});
