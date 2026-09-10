import { describe, expect, it } from "vitest";
import {
  rupeeTextToPaise,
  walletCreditRequestSchema,
} from "../src/server/payments/wallet-credit-request";

describe("Admin wallet credit input", () => {
  it("converts a decimal rupee string to exact integer paise", () => {
    expect(rupeeTextToPaise("100")).toBe(10_000);
    expect(rupeeTextToPaise("100.5")).toBe(10_050);
    expect(rupeeTextToPaise("100.50")).toBe(10_050);
  });

  it("requires a bounded decimal amount and audit reason", () => {
    expect(
      walletCreditRequestSchema.safeParse({ amountRupees: "0.001", reason: "Adjustment" }).success,
    ).toBe(false);
    expect(walletCreditRequestSchema.safeParse({ amountRupees: "100", reason: "  " }).success).toBe(
      false,
    );
    expect(() => rupeeTextToPaise("0")).toThrow("range");
  });
});
