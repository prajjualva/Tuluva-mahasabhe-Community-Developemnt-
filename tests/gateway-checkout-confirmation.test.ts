import { afterEach, describe, expect, it, vi } from "vitest";
import { openGatewayCheckout, type Checkout } from "../src/app/components/gateway-checkout";
const checkout: Checkout = {
  provider: "razorpay",
  paymentExternalId: "703e47ea-a230-43ef-a390-2f941bf8252c",
  orderId: "order_test",
  keyId: "rzp_test_public",
  amountPaise: 36900,
  currency: "INR",
};
afterEach(() => vi.unstubAllGlobals());
function install() {
  let options: { handler: () => Promise<void>; modal: { ondismiss: () => void } };
  class MockRazorpay {
    constructor(value: typeof options) {
      options = value;
    }
    open() {}
  }
  vi.stubGlobal("window", { Razorpay: MockRazorpay });
  return () => options;
}
describe("checkout completion confirmation", () => {
  it("checks captured payment on the server rather than silently ignoring the callback", async () => {
    const options = install();
    const request = vi
      .fn()
      .mockResolvedValue(Response.json({ status: "SUCCEEDED", receiptNumber: "RCP-VERIFIED" }));
    vi.stubGlobal("fetch", request);
    const result = openGatewayCheckout(checkout);
    await options().handler();
    expect(await result).toEqual({ status: "SUCCEEDED", receiptNumber: "RCP-VERIFIED" });
    expect(request).toHaveBeenCalledWith(
      `/api/member/payments/${checkout.paymentExternalId}/verify`,
      { method: "POST" },
    );
  });
  it("does not present closing the checkout as a successful payment", async () => {
    const options = install();
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const result = openGatewayCheckout(checkout);
    options().modal.ondismiss();
    expect((await result).status).toBe("PENDING");
    expect(request).not.toHaveBeenCalled();
  });
  it("does not let the modal close event overwrite a server-confirmed result", async () => {
    const options = install();
    let complete!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      ),
    );
    const result = openGatewayCheckout(checkout);
    const callback = options().handler();
    options().modal.ondismiss();
    complete(Response.json({ status: "SUCCEEDED", receiptNumber: "RCP-CONFIRMED" }));
    await callback;
    expect((await result).status).toBe("SUCCEEDED");
  });
});
