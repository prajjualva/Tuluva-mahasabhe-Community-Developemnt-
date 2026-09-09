import { z } from "zod";
export const nomineeInput = z.object({
  kind: z.enum(["PRIMARY", "SECONDARY"]),
  fullName: z.string().min(2).max(160),
  relationship: z.string().min(2).max(80),
  contactDetails: z.object({ mobile: z.string().optional(), email: z.string().email().optional() }),
  bankEncrypted: z.record(z.string()),
});
export function validateNomineeSet(
  nominees: Array<{ kind: "PRIMARY" | "SECONDARY"; isCurrent: boolean }>,
) {
  const currentPrimary = nominees.filter((n) => n.isCurrent && n.kind === "PRIMARY");
  if (currentPrimary.length !== 1)
    throw new Error("Exactly one current primary nominee is required");
  if (!nominees.some((n) => n.isCurrent && n.kind === "SECONDARY"))
    throw new Error("At least one current secondary nominee is required");
}
export function makePendingNomineeChange(previousId?: string) {
  return {
    status: "PENDING_VERIFICATION" as const,
    isCurrent: false,
    replacesNomineeId: previousId,
  };
}
