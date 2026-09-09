/** Monetary values are integer paise. Never use floating-point values for money. */
export const rupees = (value: number): number => {
  if (!Number.isSafeInteger(value)) throw new Error("Money must be a whole rupee value");
  return value * 100;
};
export const MONEY = Object.freeze({
  membershipFee: rupees(369),
  planRegistration: rupees(1000),
  contribution: rupees(100),
  supportPayment: rupees(100000),
});
export const assertPositiveMoney = (amountPaise: number): void => {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0)
    throw new Error("Amount must be a positive integer in paise");
};
