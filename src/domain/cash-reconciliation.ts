import { assertPositiveMoney } from "./money";

/** Admin confirms each allocation explicitly; no payment is silently selected by ordering. */
export function validateRemittanceAllocations(
  declaredAmountPaise: number,
  items: readonly { expectedAmountPaise: number; receivedAmountPaise: number }[],
) {
  assertPositiveMoney(declaredAmountPaise);
  let received = 0;
  for (const item of items) {
    assertPositiveMoney(item.expectedAmountPaise);
    if (
      !Number.isSafeInteger(item.receivedAmountPaise) ||
      item.receivedAmountPaise < 0 ||
      item.receivedAmountPaise > item.expectedAmountPaise
    )
      throw new Error("Received amount must be between zero and the outstanding collection amount");
    received += item.receivedAmountPaise;
  }
  if (!Number.isSafeInteger(received) || received > declaredAmountPaise)
    throw new Error("Allocated receipts exceed the declared deposit");
  return received;
}

export function parseRupeesToPaise(value: string) {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter a valid rupee amount");
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 2_147_483_647)
    throw new Error("Amount is too large");
  return amount;
}
