import { describe, expect, it } from "vitest";
import {
  parseRupeesToPaise,
  validateRemittanceAllocations,
} from "../src/domain/cash-reconciliation";
import { readCashEvidence } from "../src/server/coordinators/cash-evidence";
import { officialReceiptHtml } from "../src/server/payments/receipt-document";

describe("cash reconciliation money and evidence boundaries", () => {
  it("permits covering one receipt while leaving another uncovered", () => {
    expect(
      validateRemittanceAllocations(10000, [
        { expectedAmountPaise: 10000, receivedAmountPaise: 10000 },
        { expectedAmountPaise: 36900, receivedAmountPaise: 0 },
      ]),
    ).toBe(10000);
  });
  it.each([-1, 0.1, 10001, Number.NaN])("rejects invalid received amount %s", (amount) => {
    expect(() =>
      validateRemittanceAllocations(10000, [
        { expectedAmountPaise: 10000, receivedAmountPaise: amount },
      ]),
    ).toThrow();
  });
  it("rejects allocations beyond actual deposited money", () => {
    expect(() =>
      validateRemittanceAllocations(10000, [
        { expectedAmountPaise: 10000, receivedAmountPaise: 10000 },
        { expectedAmountPaise: 36900, receivedAmountPaise: 36900 },
      ]),
    ).toThrow("exceed");
  });
  it("parses rupee strings as exact integer paise", () => {
    expect(parseRupeesToPaise("369.01")).toBe(36901);
    expect(parseRupeesToPaise("0.10")).toBe(10);
    for (const value of ["1e2", "0.001", "-100", "NaN", "99999999"])
      expect(() => parseRupeesToPaise(value)).toThrow();
  });
  it("rejects forged MIME evidence", async () => {
    await expect(
      readCashEvidence(new File(["<html>bad</html>"], "proof.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("valid PDF");
  });
  it("never describes a pending collection as successfully paid", () => {
    const html = officialReceiptHtml({
      receiptNumber: "CASH-2026-000001",
      issuedAt: new Date(),
      amountPaise: 10000,
      method: "CASH",
      status: "PENDING",
      providerReference: null,
      paymentExternalId: "test",
      member: null,
      due: null,
    });
    expect(html).toContain("verification is pending");
    expect(html).not.toContain("records a successful");
  });
});
