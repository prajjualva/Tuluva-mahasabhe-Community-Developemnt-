import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminMemberManagement } from "../src/app/admin/member-management";

describe("Admin member search read safety", () => {
  it("does not claim there are no members before the authorized search finishes", () => {
    const html = renderToStaticMarkup(React.createElement(AdminMemberManagement));
    expect(html).toContain("Loading members…");
    expect(html).not.toContain("0 members found");
    expect(html).not.toContain("No members match these filters.");
  });
  it("disables pagination while member records are loading", () => {
    const html = renderToStaticMarkup(React.createElement(AdminMemberManagement));
    expect(html).toMatch(/disabled="">Previous members/);
    expect(html).toMatch(/disabled="">Next members/);
  });
});
