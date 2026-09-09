import { z } from "zod";
export const deathReportInput = z.object({
  memberExternalId: z.string().uuid().optional(),
  searchedMemberFound: z.boolean(),
  placeOfDeath: z.string().min(2).max(200),
  dateOfDeath: z.coerce.date(),
  details: z.string().max(4000).optional(),
});
export function createDeathReport(
  raw: z.input<typeof deathReportInput>,
  subject: { status: string; existingCaseId?: string; inWaitingPeriod?: boolean } | null,
) {
  const input = deathReportInput.parse(raw);
  if (!input.searchedMemberFound || !subject)
    return { type: "MEMBER_NOT_FOUND", status: "REPORTED" };
  if (subject.status === "DECEASED" || subject.existingCaseId)
    throw new Error("Duplicate death report prevented");
  return {
    type: "DEATH_REPORT",
    status:
      subject.status === "INACTIVE" || subject.status === "CLOSED" || subject.inWaitingPeriod
        ? "ADMIN_VERIFICATION"
        : "REPORTED",
    input,
  };
}
