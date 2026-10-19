import { describe, expect, it } from "vitest";
import { walletSettlementDto } from "../src/server/payments/payment-dto";
import { payDueFromWallet } from "../src/server/payments/wallet-service";
describe("member wallet settlement DTO", () => {
  it("never exposes internal financial keys or idempotency data", () => {
    const result = {
      payment: {
        id: "internal-payment",
        externalId: "public-payment",
        memberId: "internal-member",
        dueId: "internal-due",
        idempotencyKey: "private-command",
        amountPaise: 10000,
        status: "SUCCEEDED",
        method: "WALLET",
      },
      entry: { walletId: "internal-wallet" },
      receipt: {
        id: "internal-receipt",
        paymentId: "internal-payment",
        receiptNumber: "RCP-PUBLIC",
        issuedAt: new Date(),
      },
      alreadyProcessed: false,
    } as Awaited<ReturnType<typeof payDueFromWallet>>;
    const dto = walletSettlementDto(result);
    expect(dto).toMatchObject({
      externalId: "public-payment",
      method: "WALLET",
      receipt: { receiptNumber: "RCP-PUBLIC" },
    });
    expect(JSON.stringify(dto)).not.toMatch(/internal-|private-command|idempotencyKey/);
  });
});
