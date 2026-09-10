import { prisma } from "../database/prisma";

/** Finds a member's oldest outstanding ₹100 contribution, or one for a selected event. */
export async function selectContributionDue(input: { memberId: string; eventExternalId?: string }) {
  if (input.eventExternalId) {
    const contribution = await prisma.contribution.findFirst({
      where: {
        memberId: input.memberId,
        event: { externalId: input.eventExternalId },
        dueId: { not: null },
      },
      select: { dueId: true },
    });
    if (!contribution?.dueId) throw new Error("Contribution event due not found");
    const due = await prisma.due.findFirst({
      where: {
        id: contribution.dueId,
        memberId: input.memberId,
        purpose: "CONTRIBUTION",
        status: { in: ["PENDING", "OVERDUE", "EXPIRED"] },
      },
      select: { id: true, externalId: true, amountPaise: true },
    });
    if (!due) throw new Error("Contribution due is not payable");
    return due;
  }
  const due = await prisma.due.findFirst({
    where: {
      memberId: input.memberId,
      purpose: "CONTRIBUTION",
      status: { in: ["PENDING", "OVERDUE", "EXPIRED"] },
    },
    select: { id: true, externalId: true, amountPaise: true },
    orderBy: [{ createdAt: "asc" }, { externalId: "asc" }],
  });
  if (!due) throw new Error("No payable contribution is available");
  return due;
}
