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
  it("permits an exemption check only for a fully unpaid order with complete failed-attempt history", async () => {
    const unpaid = { ...order, status: "attempted", amount_paid: 0, amount_due: 36900 };
    const { adapter, fetcher } = provider(unpaid, {
      count: 1,
      items: [{ ...captured, status: "failed", captured: false }],
    });
    await expect(adapter.assertOrderUnpaid(order.id, 36900)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("refuses paid, partial, or mismatched orders before an exemption", async () => {
    for (const changed of [
      order,
      { ...order, status: "attempted", amount_paid: 100, amount_due: 36800 },
      { ...order, status: "created", amount_paid: 0, amount_due: 36900, currency: "USD" },
    ])
      await expect(
        provider(changed, { count: 0, items: [] }).adapter.assertOrderUnpaid(order.id, 36900),
      ).rejects.toThrow();
  });
  it.each(["authorized", "captured", "created", "refunded"])(
    "refuses a %s attempt even when the order claims to be unpaid",
    async (status) => {
      const unpaid = { ...order, status: "attempted", amount_paid: 0, amount_due: 36900 };
      await expect(
        provider(unpaid, {
          count: 1,
          items: [{ ...captured, captured: false, status }],
        }).adapter.assertOrderUnpaid(order.id, 36900),
      ).rejects.toThrow();
    },
  );
  it("refuses an incomplete payment collection", async () => {
    await expect(
      provider(
        { ...order, status: "created", amount_paid: 0, amount_due: 36900 },
        { count: 1, items: [] },
      ).adapter.assertOrderUnpaid(order.id, 36900),
    ).rejects.toThrow("complete order history");
  });
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
