import { assertPositiveMoney } from "./money";
export function createLedgerEntry(
  direction: "CREDIT" | "DEBIT",
  amountPaise: number,
  purpose: string,
) {
  assertPositiveMoney(amountPaise);
  if (!purpose.trim()) throw new Error("Ledger purpose is required");
  return Object.freeze({ direction, amountPaise, purpose });
}
