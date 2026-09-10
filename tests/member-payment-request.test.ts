import { describe, expect, it } from "vitest";
import { memberPaymentRequestSchema } from "../src/server/payments/member-payment-request";

const baseRequest = {
  dueId: "00000000-0000-4000-8000-000000000001",
  idempotencyKey: "member-payment-idempotency-key",
};

describe("member payment request methods", () => {
  it.each(["CASH", "MANUAL"])("rejects member-controlled %s payment commands", (method) => {
    expect(memberPaymentRequestSchema.safeParse({ ...baseRequest, method }).success).toBe(false);
  });

  it.each(["ONLINE", "WALLET"])("allows %s self-service payment commands", (method) => {
    expect(memberPaymentRequestSchema.safeParse({ ...baseRequest, method }).success).toBe(true);
  });
});
