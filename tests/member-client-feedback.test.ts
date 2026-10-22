import { describe, expect, it, vi } from "vitest";
import { readMemberRecord } from "../src/app/member/member-record-loader";
import { paymentStartFeedback, paymentPurposeLabel } from "../src/app/member/payment-feedback";

describe("member record failure and settlement feedback", () => {
  it("uses readable financial-purpose labels without changing purpose identifiers", () => {
    expect(paymentPurposeLabel("PLAN_REGISTRATION")).toBe("Community Support Plan registration");
    expect(paymentPurposeLabel("MEMBERSHIP")).toBe("Annual membership");
    expect(paymentPurposeLabel("CONTRIBUTION")).toBe("Event contribution");
  });
  it("keeps a real zero balance distinct from an unavailable balance", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ balancePaise: 0 })));
    expect(await readMemberRecord("/wallet", fetcher)).toEqual({
      ok: true,
      data: { balancePaise: 0 },
    });
    fetcher.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    expect(await readMemberRecord("/wallet", fetcher)).toEqual({ ok: false, status: 503 });
    expect(fetcher).toHaveBeenCalledWith("/wallet", { cache: "no-store" });
  });
  it("preserves authorization failure without serializing an error body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("private diagnostic", { status: 401 }));
    expect(await readMemberRecord("/dues", fetcher)).toEqual({ ok: false, status: 401 });
  });
  it("isolates a broken response so other records can still load", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not-json"))
      .mockResolvedValueOnce(new Response("[]"));
    expect(
      await Promise.all([readMemberRecord("/bad", fetcher), readMemberRecord("/good", fetcher)]),
    ).toEqual([
      { ok: false, status: 0 },
      { ok: true, data: [] },
    ]);
  });
  it("handles network failure without an unhandled rejection", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("network unavailable"));
    expect(await readMemberRecord("/wallet", fetcher)).toEqual({ ok: false, status: 0 });
  });
  it("confirms wallet settlement only for a succeeded payment", () => {
    expect(paymentStartFeedback({ status: "SUCCEEDED", method: "WALLET" }, "Wallet settled")).toBe(
      "Wallet settled",
    );
    for (const status of [undefined, "PENDING", "FAILED", "CANCELLED"])
      expect(paymentStartFeedback({ status, method: "WALLET" }, "Wallet settled")).not.toBe(
        "Wallet settled",
      );
  });
  it("does not present a confirmed payment as awaiting the online provider", () => {
    expect(paymentStartFeedback({ status: "SUCCEEDED" }, "Wallet settled")).toContain(
      "Payment confirmed",
    );
    expect(
      paymentStartFeedback({ status: "PENDING", method: "ONLINE" }, "Wallet settled"),
    ).toContain("not yet confirmed");
  });
});
