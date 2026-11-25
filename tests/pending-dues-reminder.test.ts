import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PendingDuesContent } from "../src/app/components/pending-dues-reminder";
import {
  pendingDuesKey,
  readPendingDues,
  shouldCheckPendingDues,
  type PendingDue,
} from "../src/app/components/pending-dues";

const due: PendingDue = {
  externalId: "1f5cda5a-a902-46c9-bd57-a74f9473bad0",
  purpose: "MEMBERSHIP",
  amountPaise: 36900,
  dueAt: "2026-12-17T00:00:00.000Z",
  status: "OVERDUE",
};

afterEach(() => vi.unstubAllGlobals());

describe("pending-dues reminder", () => {
  it("uses the signed-in user's authorized dues API without user-selected identifiers", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json([
          due,
          { ...due, purpose: "PLAN_REGISTRATION", amountPaise: 100000, status: "PENDING" },
        ]),
      );
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    expect(await readPendingDues(controller.signal)).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledWith("/api/member/dues", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  });

  it.each([401, 403, 500])("does not display a payment demand after an HTTP %s", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "Request denied" }, { status })),
    );
    expect(await readPendingDues(new AbortController().signal)).toBeNull();
  });

  it("distinguishes no payable dues from an unavailable read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([])));
    expect(await readPendingDues(new AbortController().signal)).toEqual([]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await readPendingDues(new AbortController().signal)).toBeNull();
  });

  it.each([
    [{ ...due, status: "PAID" }],
    [{ ...due, amountPaise: -36900 }],
    [{ ...due, amountPaise: 369.5 }],
    [{ ...due, externalId: "internal-id" }],
    { error: "unavailable" },
  ])("ignores invalid or settled results instead of prompting a payment", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    expect(await readPendingDues(new AbortController().signal)).toBeNull();
  });

  it("covers Member and staff workspaces, while leaving checkout and public pages uninterrupted", () => {
    for (const path of ["/member", "/member/profile", "/coordinator", "/admin"])
      expect(shouldCheckPendingDues(path)).toBe(true);
    for (const path of [
      "/member/dues",
      "/member/payments-receipts",
      "/member/community-support-plan",
      "/member/wallet",
      "/member/cash-remittances",
      "/membership-payment",
      "/login",
      "/death-support-events",
      "/admin-other",
    ])
      expect(shouldCheckPendingDues(path)).toBe(false);
  });

  it("recognizes new or changed obligations without reopening for a reordered result", () => {
    const second = { ...due, externalId: "cf8250ee-4795-4eb8-8edc-a9f825fb41a4" };
    expect(pendingDuesKey([due, second])).toBe(pendingDuesKey([second, due]));
    expect(pendingDuesKey([due])).not.toBe(pendingDuesKey([due, second]));
    expect(pendingDuesKey([due])).not.toBe(pendingDuesKey([{ ...due, status: "PENDING" }]));
  });

  it("shows exact server amounts and a real dues destination, with a dismissal choice", () => {
    const html = renderToStaticMarkup(
      React.createElement(PendingDuesContent, { dues: [due], onDismiss() {} }),
    );
    expect(html).toContain("Annual membership");
    expect(html).toContain("₹369.00");
    expect(html).toContain('href="/member/dues#payable-dues"');
    expect(html).toContain("Continue payment");
    expect(html).toContain("Later");
    expect(html).not.toContain("<form");
    expect(html).not.toContain(due.externalId);
  });
});
