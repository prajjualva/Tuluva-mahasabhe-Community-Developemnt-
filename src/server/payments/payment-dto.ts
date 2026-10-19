import type { payDueFromWallet } from "./wallet-service";
/** Financial service objects stay server-side; expose only the public receipt/payment contract. */
export function walletSettlementDto(result: Awaited<ReturnType<typeof payDueFromWallet>>) {
  return {
    externalId: result.payment.externalId,
    status: result.payment.status,
    method: result.payment.method,
    amountPaise: result.payment.amountPaise,
    receipt: result.receipt
      ? { receiptNumber: result.receipt.receiptNumber, issuedAt: result.receipt.issuedAt }
      : null,
    alreadyProcessed: result.alreadyProcessed,
  };
}
