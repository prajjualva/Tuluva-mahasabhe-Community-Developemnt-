import { assertPositiveMoney } from "./money";
export type WalletEntry = {
  direction: "CREDIT" | "DEBIT";
  amountPaise: number;
  balanceAfterPaise: number;
};
export function applyWalletTransaction(
  balancePaise: number,
  direction: WalletEntry["direction"],
  amountPaise: number,
): WalletEntry {
  assertPositiveMoney(amountPaise);
  const next = direction === "CREDIT" ? balancePaise + amountPaise : balancePaise - amountPaise;
  if (next < 0) throw new Error("Insufficient wallet balance");
  return { direction, amountPaise, balanceAfterPaise: next };
}
