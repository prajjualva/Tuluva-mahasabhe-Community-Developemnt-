import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import PrivacyPage from "../src/app/privacy/page";
import DeleteAccountPage from "../src/app/delete-account/page";
import { readPageSession } from "../src/server/http/page-session";

vi.mock("../src/app/components/public-header", () => ({ PublicHeader: () => null }));
vi.mock("../src/server/http/page-session", () => ({ readPageSession: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("lets a visitor request account deletion without installing or signing in to the app", async () => {
  vi.mocked(readPageSession).mockResolvedValue(null);
  const html = renderToStaticMarkup(await DeleteAccountPage());
  expect(html).toContain("Tuluva Mahasabhe");
  expect(html).toContain("mailto:tuluworld@gmail.com?subject=");
  expect(html).toContain("legal, accounting, fraud-prevention or dispute purposes");
});

it("provides an in-app request flow and explicitly describes review", async () => {
  vi.mocked(readPageSession).mockResolvedValue({
    dashboard: "/member",
    permissions: new Set(["member:profile:read"]),
    coordinatorActive: false,
    memberUnavailable: false,
    onboardingPaymentRequired: false,
  });
  const html = renderToStaticMarkup(await DeleteAccountPage());
  expect(html).toContain("Account deletion request");
  expect(html).toContain("Submitting a request records it for review");
  expect(renderToStaticMarkup(React.createElement(PrivacyPage))).toContain(
    'href="/delete-account"',
  );
});
