import { describe, expect, it, vi } from "vitest";
import { RazorpayPaymentProvider } from "../src/server/payments/payment-provider";

const order = {
  id: "order_verified123",
  amount: 36900,
  currency: "INR",
  status: "paid",
  amount_paid: 36900,
  amount_due: 0,
};
const captured = {
  id: "pay_captured123",
  order_id: order.id,
  amount: 36900,
  currency: "INR",
  status: "captured",
  captured: true,
  amount_refunded: 0,
};
function provider(orderBody: unknown = order, payments: unknown = { items: [captured] }) {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(orderBody))
    .mockResolvedValueOnce(Response.json(payments));
  return {
    adapter: new RazorpayPaymentProvider(
      {
        keyId: "rzp_test_unit",
        keySecret: "private-unit-secret",
        webhookSecret: "unit-webhook-secret",
      },
      fetcher,
    ),
    fetcher,
  };
}
describe("authenticated provider reconciliation", () => {
  it("requires a fully paid order and an exact captured, unrefunded INR payment", async () => {
    const { adapter, fetcher } = provider(order, {
      items: [{ ...captured, id: "pay_failed", captured: false, status: "failed" }, captured],
    });
    const result = await adapter.findCapturedOrderPayment(order.id, 36900);
    expect(result).toMatchObject({
      providerOrderId: order.id,
      providerReference: captured.id,
      amountPaise: 36900,
      currency: "INR",
    });
    expect(result?.verifiedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(result)).not.toContain("private-unit-secret");
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      `https://api.razorpay.com/v1/orders/${order.id}`,
      `https://api.razorpay.com/v1/orders/${order.id}/payments`,
    ]);
  });
  it("does not settle an authorization, failed attempt or unpaid order", async () => {
    expect(
      await provider({
        ...order,
        status: "attempted",
        amount_paid: 0,
        amount_due: 36900,
      }).adapter.findCapturedOrderPayment(order.id, 36900),
    ).toBeNull();
    expect(
      await provider(order, {
        items: [{ ...captured, status: "authorized", captured: false }],
      }).adapter.findCapturedOrderPayment(order.id, 36900),
    ).toBeNull();
  });
  it.each([
    { ...captured, order_id: "order_other" },
    { ...captured, amount: 100 },
    { ...captured, currency: "USD" },
  ])("rejects mismatched captured evidence", async (payment) => {
    await expect(
      provider(order, { items: [payment] }).adapter.findCapturedOrderPayment(order.id, 36900),
    ).rejects.toThrow();
  });
  it("does not activate membership from refunded funds or multiple captures", async () => {
    expect(
      await provider(order, {
        items: [{ ...captured, amount_refunded: 36900 }],
      }).adapter.findCapturedOrderPayment(order.id, 36900),
    ).toBeNull();
    await expect(
      provider(order, {
        items: [captured, { ...captured, id: "pay_second" }],
      }).adapter.findCapturedOrderPayment(order.id, 36900),
    ).rejects.toThrow();
  });
  it("does not treat network failure or provider rejection as success", async () => {
    const { adapter, fetcher } = provider();
    fetcher.mockReset().mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(adapter.findCapturedOrderPayment(order.id, 36900)).rejects.toThrow(
      "temporarily unavailable",
    );
  });
});
