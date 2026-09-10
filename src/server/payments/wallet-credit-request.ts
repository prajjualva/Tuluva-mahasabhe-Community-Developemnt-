import { z } from "zod";

const MAX_DATABASE_INT = 2_147_483_647n;

export const walletCreditRequestSchema = z.object({
  amountRupees: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,2})?$/, "Enter an amount such as 100 or 100.50"),
  reason: z.string().trim().min(3, "A reason is required").max(500),
});

/** Parses an Admin-entered rupee string without JavaScript floating point. */
export function rupeeTextToPaise(value: string) {
  const [whole, fraction = ""] = value.trim().split(".");
  const paise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (paise <= 0n || paise > MAX_DATABASE_INT)
    throw new Error("Wallet credit amount is out of range");
  return Number(paise);
}
