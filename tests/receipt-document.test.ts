import { describe, expect, it } from "vitest";
import {
  officialReceiptHtml,
  officialReceiptShareText,
} from "../src/server/payments/receipt-document";

const receipt = {
  receiptNumber: "RCP-2026-ABC123",
  issuedAt: new Date("2026-09-10T12:00:00.000Z"),
  amountPaise: 36_900,
  method: "WALLET",
  status: "SUCCEEDED",
  providerReference: null,
  paymentExternalId: "b4c26f25-5b5c-42bc-8d4d-dfdb2b6b3520",
  member: { externalId: "e8117ff6-45bd-4f17-812c-8e2650318c0b", fullName: "Asha <Member>" },
  due: { externalId: "a77ff9c4-cd5e-4050-aa1d-49c35ba4ce1d", purpose: "MEMBERSHIP" },
};

describe("official receipt documents", () => {
  it("renders every required receipt field and escapes member-controlled text", () => {
    const html = officialReceiptHtml(receipt);
    expect(html).toContain("RCP-2026-ABC123");
    expect(html).toContain("₹369.00");
    expect(html).toContain("MEMBERSHIP");
    expect(html).toContain("WALLET");
    expect(html).toContain("SUCCEEDED");
    expect(html).toContain("Asha &lt;Member&gt;");
    expect(html).not.toContain("Asha <Member>");
  });

  it("builds shareable text without omitting the official reference", () => {
    const text = officialReceiptShareText(receipt);
    expect(text).toContain(receipt.receiptNumber);
    expect(text).toContain(receipt.paymentExternalId);
    expect(text).toContain("₹369.00");
  });
});
