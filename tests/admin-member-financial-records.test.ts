import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminMemberFinancialRecords } from "../src/app/admin/member-financial-records";
describe("Admin member financial presentation", () => {
  it("keeps unpaid fee exemptions distinct from receipts and confirmed money", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminMemberFinancialRecords, {
        dues: [
          {
            externalId: crypto.randomUUID(),
            purpose: "PLAN_REGISTRATION",
            amountPaise: 100000,
            status: "WAIVED",
            dueAt: "2026-12-17T00:00:00Z",
          },
        ],
        payments: [
          {
            externalId: crypto.randomUUID(),
            due: { purpose: "PLAN_REGISTRATION", status: "WAIVED" },
            amountPaise: 100000,
            method: "ONLINE",
            status: "PENDING",
            receipt: null,
          },
        ],
      }),
    );
    expect(html).toContain("Fee exempted.");
    expect(html).toContain("this is not a payment request");
    expect(html).not.toContain("Download receipt");
    expect(html).not.toContain('data-status="SUCCEEDED"');
    expect(html).toContain("<summary>Payment reference</summary>");
  });
  it("offers the exact authorized receipt download without using a long receipt number as the button label", () => {
    const receiptNumber = "RCP-2026-0123456789ABCDEF0123456789ABCDEF";
    const html = renderToStaticMarkup(
      React.createElement(AdminMemberFinancialRecords, {
        dues: [],
        payments: [
          {
            externalId: crypto.randomUUID(),
            amountPaise: 36900,
            method: "ONLINE",
            status: "SUCCEEDED",
            receipt: { receiptNumber },
          },
        ],
      }),
    );
    expect(html).toContain(`/api/admin/receipts/${receiptNumber}/download`);
    expect(html).toContain(">Download receipt ");
    expect(html).not.toContain(`>${receiptNumber} — download`);
  });
});
