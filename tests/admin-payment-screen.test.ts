import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminPaymentRefunds } from "../src/app/admin/payment-refunds";
import { AdminWalletCredit } from "../src/app/admin/wallet-credit";

describe("Admin payment screen initial read safety", () => {
  it("shows loading rather than a false empty result before records arrive", () => {
    const html = renderToStaticMarkup(React.createElement(AdminPaymentRefunds));
    expect(html).toContain("Loading payment records…");
    expect(html).not.toContain("No payments match these filters.");
    expect(html).not.toContain("0 matching records");
  });

  it("offers no settlement actions before the authorized read completes", () => {
    const html = renderToStaticMarkup(React.createElement(AdminPaymentRefunds));
    expect(html).not.toContain("Request full refund");
    expect(html).not.toContain("Record issued cash/manual refund");
    expect(html).toMatch(/disabled="">Previous payments/);
    expect(html).toMatch(/disabled="">Next payments/);
  });

  it("disables wallet credit until a client idempotency key is ready", () => {
    const html = renderToStaticMarkup(React.createElement(AdminWalletCredit));
    expect(html).toMatch(/disabled="" type="submit">Record wallet credit/);
    expect(html).toContain('role="status"');
  });
});
