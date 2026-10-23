import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperationsShell } from "../src/app/components/operations-shell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe("operations navigation accessibility", () => {
  it("provides a named main landmark and a programmatically focusable section heading", () => {
    const html = renderToStaticMarkup(
      React.createElement(OperationsShell, {
        role: "Admin",
        panels: [{ id: "members", label: "Members", description: "Member records", content: null }],
      }),
    );
    expect(html).toContain('aria-labelledby="operations-heading"');
    expect(html).toContain('<h1 id="operations-heading" tabindex="-1">Members</h1>');
    expect(html).toContain('aria-controls="operations-navigation"');
  });
});
