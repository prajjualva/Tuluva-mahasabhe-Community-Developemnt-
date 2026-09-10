import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DeathCaseStatus, DeathEligibilityStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { generateContributionDuesInTransaction } from "../contributions/contribution-generation-service";
import { prisma } from "../database/prisma";
import {
  readDeathEvidence,
  removeDeathEvidence,
  storeDeathEvidence,
  type DeathEvidenceFile,
} from "../documents/death-document-storage";
import { requestPaymentRefund } from "../payments/payment-refund-service";

const RETRIABLE_TRANSACTION_CODES = new Set(["P2002", "P2034"]);

export const deathReportSubmissionInput = z.object({
  memberExternalId: z.string().uuid().optional(),
  reporterIdentity: z.string().trim().min(2).max(300),
  placeOfDeath: z.string().trim().min(2).max(200),
  dateOfDeath: z.coerce.date(),
  details: z.string().trim().max(4000).optional(),
});

export const deathReportMemberLinkInput = z.object({
  memberExternalId: z.string().uuid(),
});

export const deathReportReviewInput = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("APPROVE"),
    reason: z.string().trim().max(1000).optional(),
    publicDetails: z.string().trim().max(4000).optional(),
  }),
  z.object({
    decision: z.literal("REJECT"),
    reason: z.string().trim().min(3).max(1000),
  }),
]);

export const deathEventEditInput = z
  .object({
    placeOfDeath: z.string().trim().min(2).max(200).optional(),
    dateOfDeath: z.coerce.date().optional(),
    publicDetails: z.string().trim().max(4000).nullable().optional(),
    reason: z.string().trim().min(3).max(1000),
  })
  .refine(
    (input) =>
      input.placeOfDeath !== undefined ||
      input.dateOfDeath !== undefined ||
      input.publicDetails !== undefined,
    "At least one public event field must be changed",
  );

export const eventClosureInput = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const eventCancellationInput = z.object({
  reason: z.string().trim().min(3).max(1000),
  settlementMethod: z.enum(["ORIGINAL_METHOD", "FOUNDATION_WALLET"]),
});

export const condolenceInput = z.object({ body: z.string().trim().min(1).max(1000) });
export const commentModerationInput = z.object({ reason: z.string().trim().min(3).max(1000) });

type EligibilityMember = {
  status: string;
  joinedAt?: Date;
  memberships: Array<{ status: string; startedAt: Date; endedAt: Date | null }>;
  plans: Array<{ status: string; activatedAt: Date | null; waitingEndsAt: Date | null }>;
  nominees: Array<{ id: string; kind: string; status: string; isCurrent: boolean }>;
};

export type DeathEligibilityEvaluation = {
  status: DeathEligibilityStatus;
  reason: string;
  verifiedNomineeId: string | null;
};

export function membershipStatusAtDeath(
  memberships: EligibilityMember["memberships"],
  fallbackStatus: string,
  dateOfDeath: Date,
) {
  const historical = memberships
    .filter(
      (membership) =>
        membership.startedAt.getTime() <= dateOfDeath.getTime() &&
        (!membership.endedAt || membership.endedAt.getTime() >= dateOfDeath.getTime()),
    )
    .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())[0];
  // Old data created before membership history existed has no historical row;
  // preserve its then-current state as a backwards-compatible fallback.
  return historical?.status ?? fallbackStatus;
}

/**
 * This preliminary support decision always uses the actual date of death.
 * It is intentionally not used by contribution generation: contribution
 * obligation is only historical membership existence at event creation.
 */
export function evaluateDeathSupportEligibility(
  member: EligibilityMember | null,
  dateOfDeath: Date,
): DeathEligibilityEvaluation {
  if (!member)
    return {
      status: "INELIGIBLE",
      reason: "MEMBER_NOT_FOUND",
      verifiedNomineeId: null,
    };

  const primary = member.nominees.find(
    (nominee) => nominee.kind === "PRIMARY" && nominee.isCurrent && nominee.status === "VERIFIED",
  );
  if (member.joinedAt && member.joinedAt.getTime() > dateOfDeath.getTime())
    return {
      status: "INELIGIBLE",
      reason: "MEMBERSHIP_NOT_STARTED_AT_DEATH",
      verifiedNomineeId: primary?.id ?? null,
    };
  const plan = member.plans.find(
    (candidate) =>
      candidate.status === "ACTIVE" &&
      candidate.activatedAt !== null &&
      candidate.activatedAt.getTime() <= dateOfDeath.getTime(),
  );

  const statusAtDeath = membershipStatusAtDeath(member.memberships, member.status, dateOfDeath);
  if (statusAtDeath === "INACTIVE" || statusAtDeath === "CLOSED")
    return {
      status: "ADMIN_REVIEW",
      reason: `MEMBERSHIP_${statusAtDeath}_AT_DEATH`,
      verifiedNomineeId: primary?.id ?? null,
    };
  if (!plan)
    return {
      status: "INELIGIBLE",
      reason: "NO_ACTIVE_PLAN_AT_DEATH",
      verifiedNomineeId: primary?.id ?? null,
    };
  if (plan.waitingEndsAt && plan.waitingEndsAt.getTime() > dateOfDeath.getTime())
    return {
      status: "ADMIN_REVIEW",
      reason: "PLAN_WAITING_PERIOD_AT_DEATH",
      verifiedNomineeId: primary?.id ?? null,
    };
  if (!primary)
    return {
      status: "ADMIN_REVIEW",
      reason: "VERIFIED_PRIMARY_NOMINEE_REQUIRED",
      verifiedNomineeId: null,
    };
  return { status: "ELIGIBLE", reason: "PRELIMINARY_ELIGIBLE", verifiedNomineeId: primary.id };
}

const publicReportStatus = (status: DeathCaseStatus) => ({ status });

// Closing ends active event operations; it does not erase a verified public
// notice. Cancellation is different and removes the event from public views.
const isPublicDeathSupportEventStatus = (status: string | null | undefined) =>
  status === "PUBLISHED" || status === "CLOSED";

const hashReporterAccessToken = (token: string) =>
  createHash("sha256").update(`death-report-access:${token}`).digest("hex");

const createReporterAccessToken = () => randomBytes(32).toString("base64url");

const hasMatchingReporterAccessToken = (storedHash: string | null, suppliedToken: string) => {
  if (!storedHash || !suppliedToken) return false;
  const actual = Buffer.from(storedHash, "hex");
  const expected = Buffer.from(hashReporterAccessToken(suppliedToken), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

async function runSerializableDeathWorkflow<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (error) {
      const retriable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        RETRIABLE_TRANSACTION_CODES.has(error.code);
      if (!retriable || attempt === 2) throw error;
    }
  }
  throw new Error("Death workflow could not be completed");
}

const reportMemberSelect = {
  id: true,
  externalId: true,
  status: true,
  joinedAt: true,
  coordinatorId: true,
  plans: {
    select: { status: true, activatedAt: true, waitingEndsAt: true },
    orderBy: { createdAt: "desc" as const },
  },
  memberships: { select: { status: true, startedAt: true, endedAt: true } },
  nominees: {
    select: { id: true, kind: true, status: true, isCurrent: true },
  },
  deathCases: {
    where: { status: { notIn: ["REJECTED", "CANCELLED"] } },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      externalId: true,
      event: { select: { externalId: true, status: true } },
    },
  },
} satisfies Prisma.MemberSelect;

export async function submitDeathReport(
  raw: z.input<typeof deathReportSubmissionInput>,
  context: { ipHash?: string; requestId?: string } = {},
) {
  const input = deathReportSubmissionInput.parse(raw);
  if (input.dateOfDeath.getTime() > Date.now() + 5 * 60 * 1000)
    throw new Error("Date of death cannot be in the future");

  return runSerializableDeathWorkflow(async (tx) => {
    const member = input.memberExternalId
      ? await tx.member.findUnique({
          where: { externalId: input.memberExternalId },
          select: reportMemberSelect,
        })
      : null;
    const existingCase = member?.deathCases[0];
    if (member && (member.status === "DECEASED" || existingCase)) {
      const publishedEvent = isPublicDeathSupportEventStatus(existingCase?.event?.status)
        ? existingCase?.event?.externalId
        : undefined;
      await tx.auditLog.create({
        data: {
          actorRole: "PUBLIC_REPORTER",
          action: "DEATH_REPORT_DUPLICATE_PREVENTED",
          entityType: "DeathCase",
          entityId: member.id,
          requestId: context.requestId,
          ipHash: context.ipHash,
          afterState: { publishedEventExternalId: publishedEvent ?? null },
        },
      });
      return {
        outcome: "DUPLICATE" as const,
        warning: "A death report for this member is already being handled.",
        existingEventExternalId: publishedEvent ?? null,
      };
    }

    const eligibility = evaluateDeathSupportEligibility(member, input.dateOfDeath);
    const requiresAdminReview =
      !member ||
      member.status === "INACTIVE" ||
      member.status === "CLOSED" ||
      eligibility.status !== "ELIGIBLE";
    const reporterAccessToken = createReporterAccessToken();
    const deathCase = await tx.deathCase.create({
      data: {
        memberId: member?.id,
        reporterIdentity: input.reporterIdentity,
        reporterAccessTokenHash: hashReporterAccessToken(reporterAccessToken),
        placeOfDeath: input.placeOfDeath,
        dateOfDeath: input.dateOfDeath,
        details: input.details || undefined,
        status: requiresAdminReview ? "ADMIN_VERIFICATION" : "REPORTED",
        requiresAdminReview,
        eligibilityStatus: eligibility.status,
        eligibilityReason: eligibility.reason,
        verifiedNomineeId: eligibility.verifiedNomineeId ?? undefined,
      },
      select: { id: true, externalId: true, status: true, requiresAdminReview: true },
    });
    await tx.auditLog.create({
      data: {
        actorRole: "PUBLIC_REPORTER",
        action: member ? "DEATH_REPORT_SUBMITTED" : "DEATH_REPORT_MEMBER_NOT_FOUND",
        entityType: "DeathCase",
        entityId: deathCase.id,
        requestId: context.requestId,
        ipHash: context.ipHash,
        afterState: {
          memberFound: Boolean(member),
          requiresAdminReview,
          eligibilityStatus: eligibility.status,
        },
      },
    });
    return {
      outcome: member ? ("CREATED" as const) : ("MEMBER_NOT_FOUND" as const),
      case: {
        externalId: deathCase.externalId,
        ...publicReportStatus(deathCase.status),
        requiresAdminReview,
      },
      reportAccessToken: reporterAccessToken,
    };
  });
}

export async function searchReportableMembers(query: string) {
  const term = query.trim();
  if (term.length < 2 || term.length > 160) throw new Error("Search needs 2 to 160 characters");
  const members = await prisma.member.findMany({
    where: {
      OR: [
        { fullName: { contains: term, mode: "insensitive" } },
        { user: { mobile: { contains: term } } },
        { user: { email: { contains: term, mode: "insensitive" } } },
      ],
    },
    take: 10,
    orderBy: { fullName: "asc" },
    select: {
      externalId: true,
      fullName: true,
      address: true,
      status: true,
      user: { select: { mobile: true, email: true } },
      plans: { select: { status: true, waitingEndsAt: true }, orderBy: { createdAt: "desc" } },
      deathCases: {
        where: { status: { notIn: ["REJECTED", "CANCELLED"] } },
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { event: { select: { externalId: true, status: true } } },
      },
    },
  });
  const now = new Date();
  return members.map((member) => {
    const activePlan = member.plans.find((plan) => plan.status === "ACTIVE");
    const event = member.deathCases[0]?.event;
    return {
      externalId: member.externalId,
      fullName: member.fullName,
      mobile: member.user.mobile,
      email: member.user.email,
      address: member.address,
      status: member.status,
      inWaitingPeriod: Boolean(activePlan?.waitingEndsAt && activePlan.waitingEndsAt > now),
      existingEventExternalId: isPublicDeathSupportEventStatus(event?.status)
        ? (event?.externalId ?? null)
        : null,
      hasOpenDeathReport: Boolean(member.deathCases[0]),
    };
  });
}

/**
 * A Member Not Found report remains in the Admin-only queue until an
 * Administrator deliberately links it to the correct existing member. This
 * never bypasses the Admin verification step or creates an event by itself.
 */
export async function linkUnmatchedDeathReportToMember(
  caseExternalId: string,
  actorId: string,
  raw: z.input<typeof deathReportMemberLinkInput>,
) {
  const input = deathReportMemberLinkInput.parse(raw);
  return runSerializableDeathWorkflow(async (tx) => {
    const deathCase = await tx.deathCase.findUnique({
      where: { externalId: caseExternalId },
      select: {
        id: true,
        memberId: true,
        status: true,
        dateOfDeath: true,
      },
    });
    if (!deathCase) throw new Error("Death report not found");
    if (deathCase.memberId) throw new Error("This death report is already linked to a member");
    if (deathCase.status !== "ADMIN_VERIFICATION")
      throw new Error("Only an unresolved Member Not Found report can be linked");

    const member = await tx.member.findUnique({
      where: { externalId: input.memberExternalId },
      select: reportMemberSelect,
    });
    if (!member) throw new Error("Selected member was not found");
    if (member.status === "DECEASED" || member.deathCases[0])
      throw new Error("The selected member already has a death report or Death Support Event");

    const eligibility = evaluateDeathSupportEligibility(member, deathCase.dateOfDeath);
    const linked = await tx.deathCase.update({
      where: { id: deathCase.id },
      data: {
        memberId: member.id,
        // An unlinked public report is always resolved by the Administrator;
        // it must not re-enter the Coordinator queue after being linked.
        status: "ADMIN_VERIFICATION",
        requiresAdminReview: true,
        eligibilityStatus: eligibility.status,
        eligibilityReason: eligibility.reason,
        verifiedNomineeId: eligibility.verifiedNomineeId ?? null,
      },
      select: { externalId: true, status: true, eligibilityStatus: true, eligibilityReason: true },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "DEATH_REPORT_MEMBER_LINKED",
        entityType: "DeathCase",
        entityId: deathCase.id,
        beforeState: { memberId: null, status: deathCase.status },
        afterState: {
          memberExternalId: member.externalId,
          status: linked.status,
          eligibilityStatus: linked.eligibilityStatus,
        },
      },
    });
    return linked;
  });
}

export async function uploadDeathReportDocument(input: {
  caseExternalId: string;
  reporterAccessToken: string;
  file: DeathEvidenceFile;
}) {
  const deathCase = await prisma.deathCase.findUnique({
    where: { externalId: input.caseExternalId },
    select: { id: true, externalId: true, reporterAccessTokenHash: true },
  });
  if (
    !deathCase ||
    !hasMatchingReporterAccessToken(deathCase.reporterAccessTokenHash, input.reporterAccessToken)
  )
    throw new Error("Death report access is denied");

  const stored = await storeDeathEvidence(deathCase.externalId, input.file);
  try {
    return await prisma.$transaction(async (tx) => {
      const document = await tx.deathDocument.create({
        data: { deathCaseId: deathCase.id, ...stored },
        select: {
          externalId: true,
          contentType: true,
          originalFilename: true,
          sizeBytes: true,
          uploadedAt: true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorRole: "PUBLIC_REPORTER",
          action: "DEATH_EVIDENCE_UPLOADED",
          entityType: "DeathDocument",
          entityId: document.externalId,
          afterState: { contentType: document.contentType, sizeBytes: document.sizeBytes },
        },
      });
      return document;
    });
  } catch (error) {
    await removeDeathEvidence(stored.storageKey);
    throw error;
  }
}

export async function listCoordinatorDeathReports(actorId: string) {
  const coordinator = await prisma.coordinator.findFirst({
    where: { member: { userId: actorId }, isSuspended: false, status: "ACTIVE" },
    select: { id: true },
  });
  if (!coordinator) throw new Error("Active Coordinator profile is required");
  return prisma.deathCase.findMany({
    where: {
      status: "REPORTED",
      requiresAdminReview: false,
      member: { coordinatorId: coordinator.id },
    },
    orderBy: { createdAt: "asc" },
    select: {
      externalId: true,
      placeOfDeath: true,
      dateOfDeath: true,
      details: true,
      createdAt: true,
      member: { select: { externalId: true, fullName: true, address: true } },
      documents: {
        select: { externalId: true, contentType: true, originalFilename: true, sizeBytes: true },
      },
    },
  });
}

export async function confirmDeathReportByCoordinator(caseExternalId: string, actorId: string) {
  return runSerializableDeathWorkflow(async (tx) => {
    const deathCase = await tx.deathCase.findUnique({
      where: { externalId: caseExternalId },
      select: {
        id: true,
        status: true,
        requiresAdminReview: true,
        member: { select: { coordinatorId: true } },
      },
    });
    if (!deathCase?.member) throw new Error("Death report is not assigned to a Coordinator");
    if (deathCase.status !== "REPORTED" || deathCase.requiresAdminReview)
      throw new Error("This death report requires Admin verification");
    const coordinator = await tx.coordinator.findFirst({
      where: { member: { userId: actorId }, isSuspended: false, status: "ACTIVE" },
      select: { id: true },
    });
    if (!coordinator || coordinator.id !== deathCase.member.coordinatorId)
      throw new Error("Coordinator is not assigned to this member");
    const confirmedAt = new Date();
    const updated = await tx.deathCase.update({
      where: { id: deathCase.id },
      data: {
        status: "COORDINATOR_CONFIRMED",
        coordinatorConfirmedAt: confirmedAt,
        coordinatorConfirmedById: actorId,
      },
      select: { externalId: true, status: true, coordinatorConfirmedAt: true },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "DEATH_REPORT_COORDINATOR_CONFIRMED",
        entityType: "DeathCase",
        entityId: deathCase.id,
        afterState: { status: updated.status, confirmedAt: confirmedAt.toISOString() },
      },
    });
    return updated;
  });
}

export async function listAdminDeathReports(status?: DeathCaseStatus) {
  return prisma.deathCase.findMany({
    where: status ? { status } : undefined,
    take: 100,
    orderBy: { createdAt: "asc" },
    select: {
      externalId: true,
      reporterIdentity: true,
      placeOfDeath: true,
      dateOfDeath: true,
      details: true,
      status: true,
      requiresAdminReview: true,
      eligibilityStatus: true,
      eligibilityReason: true,
      createdAt: true,
      coordinatorConfirmedAt: true,
      adminVerifiedAt: true,
      rejectionReason: true,
      member: {
        select: {
          externalId: true,
          fullName: true,
          address: true,
          status: true,
          user: { select: { email: true, mobile: true } },
        },
      },
      verifiedNominee: { select: { fullName: true, relationship: true, status: true } },
      event: { select: { externalId: true, status: true, publishedAt: true } },
      documents: {
        select: {
          externalId: true,
          contentType: true,
          originalFilename: true,
          sizeBytes: true,
          uploadedAt: true,
        },
        orderBy: { uploadedAt: "asc" },
      },
    },
  });
}

export async function reviewDeathReportByAdmin(
  caseExternalId: string,
  actorId: string,
  raw: z.input<typeof deathReportReviewInput>,
) {
  const input = deathReportReviewInput.parse(raw);
  return runSerializableDeathWorkflow(async (tx) => {
    const deathCase = await tx.deathCase.findUnique({
      where: { externalId: caseExternalId },
      select: {
        id: true,
        externalId: true,
        memberId: true,
        status: true,
        requiresAdminReview: true,
        dateOfDeath: true,
        event: { select: { id: true, externalId: true, status: true } },
        member: {
          select: {
            id: true,
            status: true,
            joinedAt: true,
            plans: {
              select: { status: true, activatedAt: true, waitingEndsAt: true },
              orderBy: { createdAt: "desc" },
            },
            memberships: { select: { status: true, startedAt: true, endedAt: true } },
            nominees: { select: { id: true, kind: true, status: true, isCurrent: true } },
          },
        },
      },
    });
    if (!deathCase) throw new Error("Death report not found");
    if (["APPROVED", "REJECTED", "CANCELLED", "CLOSED"].includes(deathCase.status))
      throw new Error("Death report has already been finally reviewed");
    if (!["REPORTED", "COORDINATOR_CONFIRMED", "ADMIN_VERIFICATION"].includes(deathCase.status))
      throw new Error("Death report is not ready for Admin review");

    const reviewedAt = new Date();
    if (input.decision === "REJECT") {
      const rejected = await tx.deathCase.update({
        where: { id: deathCase.id },
        data: {
          status: "REJECTED",
          adminVerifiedAt: reviewedAt,
          adminVerifiedById: actorId,
          rejectedAt: reviewedAt,
          rejectionReason: input.reason,
        },
        select: { externalId: true, status: true, rejectedAt: true, rejectionReason: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "DEATH_REPORT_REJECTED",
          entityType: "DeathCase",
          entityId: deathCase.id,
          reason: input.reason,
          beforeState: { status: deathCase.status },
          afterState: { status: rejected.status },
        },
      });
      return { decision: "REJECTED" as const, case: rejected, event: null };
    }

    if (!deathCase.member || !deathCase.memberId)
      throw new Error("A member must be selected before a death report can be approved");
    if (deathCase.status === "REPORTED" && !deathCase.requiresAdminReview && !input.reason?.trim())
      throw new Error("Admin approval before Coordinator confirmation requires a reason");
    const eligibility = evaluateDeathSupportEligibility(deathCase.member, deathCase.dateOfDeath);
    const updatedCase = await tx.deathCase.update({
      where: { id: deathCase.id },
      data: {
        status: "APPROVED",
        adminVerifiedAt: reviewedAt,
        adminVerifiedById: actorId,
        approvedAt: reviewedAt,
        eligibilityStatus: eligibility.status,
        eligibilityReason: eligibility.reason,
        verifiedNomineeId: eligibility.verifiedNomineeId ?? null,
      },
      select: { externalId: true, status: true, approvedAt: true, eligibilityStatus: true },
    });
    const event = await tx.contributionEvent.upsert({
      where: { deathCaseId: deathCase.id },
      create: {
        deathCaseId: deathCase.id,
        status: "APPROVED",
        publicDetails: input.publicDetails || undefined,
        approvedAt: reviewedAt,
        approvedById: actorId,
      },
      update: {},
      select: { id: true, externalId: true, status: true, createdAt: true },
    });

    // A verified death is also the durable Phase 5 deceased transition. It
    // keeps financial history append-only while waiving only unsettled dues.
    const priorStatus = deathCase.member.status;
    if (priorStatus !== "DECEASED") {
      await tx.member.update({
        where: { id: deathCase.member.id },
        data: { status: "DECEASED", deceasedAt: deathCase.dateOfDeath },
      });
      await tx.membership.updateMany({
        where: { memberId: deathCase.member.id, endedAt: null },
        data: { endedAt: reviewedAt },
      });
      await tx.membership.create({
        data: { memberId: deathCase.member.id, status: "DECEASED", startedAt: reviewedAt },
      });
      await tx.due.updateMany({
        where: {
          memberId: deathCase.member.id,
          status: { in: ["PENDING", "OVERDUE", "EXPIRED"] },
        },
        data: { status: "WAIVED" },
      });
      await tx.paymentMandate.updateMany({
        where: { memberId: deathCase.member.id, status: { notIn: ["CANCELLED", "REVOKED"] } },
        data: { status: "CANCELLED" },
      });
      await tx.communitySupportPlan.updateMany({
        where: { memberId: deathCase.member.id, status: "ACTIVE" },
        data: { status: "SUSPENDED" },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "MEMBER_MARKED_DECEASED",
          entityType: "Member",
          entityId: deathCase.member.id,
          afterState: { status: "DECEASED", deceasedAt: deathCase.dateOfDeath.toISOString() },
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId,
        action: "DEATH_REPORT_APPROVED",
        entityType: "DeathCase",
        entityId: deathCase.id,
        reason: input.reason?.trim() || undefined,
        beforeState: { status: deathCase.status },
        afterState: {
          status: updatedCase.status,
          eventExternalId: event.externalId,
          eligibilityStatus: eligibility.status,
        },
      },
    });
    return {
      decision: "APPROVED" as const,
      case: updatedCase,
      event: {
        externalId: event.externalId,
        status: event.status,
        createdAt: event.createdAt,
      },
    };
  });
}

/**
 * Publication and the historical ₹100 contribution batch are one serializable
 * database transaction. A support-eligibility outcome never enters this call.
 */
export async function publishDeathSupportEvent(eventExternalId: string, actorId: string) {
  return runSerializableDeathWorkflow(async (tx) => {
    const result = await generateContributionDuesInTransaction(tx, {
      eventExternalId,
      actorId,
    });
    const event = await tx.contributionEvent.update({
      where: { externalId: eventExternalId },
      data: { publishedById: actorId },
      select: { externalId: true, status: true, publishedAt: true },
    });
    return { ...result, event };
  });
}

export async function editPublishedDeathSupportEvent(
  eventExternalId: string,
  actorId: string,
  raw: z.input<typeof deathEventEditInput>,
) {
  const input = deathEventEditInput.parse(raw);
  if (input.dateOfDeath && input.dateOfDeath.getTime() > Date.now() + 5 * 60 * 1000)
    throw new Error("Date of death cannot be in the future");
  return runSerializableDeathWorkflow(async (tx) => {
    const event = await tx.contributionEvent.findUnique({
      where: { externalId: eventExternalId },
      include: { deathCase: { select: { id: true, placeOfDeath: true, dateOfDeath: true } } },
    });
    if (!event || event.status !== "PUBLISHED")
      throw new Error("Only a published event can be edited");
    const updatedCase =
      input.placeOfDeath !== undefined || input.dateOfDeath !== undefined
        ? await tx.deathCase.update({
            where: { id: event.deathCase.id },
            data: {
              placeOfDeath: input.placeOfDeath,
              dateOfDeath: input.dateOfDeath,
            },
            select: { placeOfDeath: true, dateOfDeath: true },
          })
        : { placeOfDeath: event.deathCase.placeOfDeath, dateOfDeath: event.deathCase.dateOfDeath };
    const updatedEvent = await tx.contributionEvent.update({
      where: { id: event.id },
      data: { publicDetails: input.publicDetails },
      select: { externalId: true, status: true, publicDetails: true, publishedAt: true },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "DEATH_SUPPORT_EVENT_EDITED",
        entityType: "ContributionEvent",
        entityId: event.id,
        reason: input.reason,
        beforeState: {
          placeOfDeath: event.deathCase.placeOfDeath,
          dateOfDeath: event.deathCase.dateOfDeath.toISOString(),
          publicDetails: event.publicDetails,
        },
        afterState: {
          placeOfDeath: updatedCase.placeOfDeath,
          dateOfDeath: updatedCase.dateOfDeath.toISOString(),
          publicDetails: updatedEvent.publicDetails,
        },
      },
    });
    return {
      ...updatedEvent,
      placeOfDeath: updatedCase.placeOfDeath,
      dateOfDeath: updatedCase.dateOfDeath,
    };
  });
}

export async function closeDeathSupportEvent(
  eventExternalId: string,
  actorId: string,
  reason: string,
) {
  const input = eventClosureInput.parse({ reason });
  return runSerializableDeathWorkflow(async (tx) => {
    const event = await tx.contributionEvent.findUnique({ where: { externalId: eventExternalId } });
    if (!event || event.status !== "PUBLISHED")
      throw new Error("Only a published event can be closed");
    const closedAt = new Date();
    const closed = await tx.contributionEvent.update({
      where: { id: event.id },
      data: { status: "CLOSED", closedAt, closedById: actorId },
      select: { externalId: true, status: true, closedAt: true },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "DEATH_SUPPORT_EVENT_CLOSED",
        entityType: "ContributionEvent",
        entityId: event.id,
        reason: input.reason,
        beforeState: { status: event.status },
        afterState: { status: closed.status, closedAt: closedAt.toISOString() },
      },
    });
    return closed;
  });
}

async function prepareEventCancellation(
  eventExternalId: string,
  actorId: string,
  input: z.output<typeof eventCancellationInput>,
) {
  return runSerializableDeathWorkflow(async (tx) => {
    const event = await tx.contributionEvent.findUnique({
      where: { externalId: eventExternalId },
      include: {
        deathCase: { select: { id: true } },
        cancellation: { select: { id: true, externalId: true, settlementMethod: true } },
        contributions: { select: { dueId: true } },
      },
    });
    if (!event) throw new Error("Death Support Event not found");
    if (event.status === "CANCELLED") {
      if (!event.cancellation) throw new Error("Cancelled event has no cancellation record");
      if (event.cancellation.settlementMethod !== input.settlementMethod)
        throw new Error("Event cancellation settlement method is immutable");
      return { cancellationExternalId: event.cancellation.externalId, created: false };
    }
    if (!["PUBLISHED", "CLOSED"].includes(event.status))
      throw new Error("Only a published or closed event can be cancelled");

    const dueIds = event.contributions.flatMap((contribution) =>
      contribution.dueId ? [contribution.dueId] : [],
    );
    const paidPayments = dueIds.length
      ? await tx.payment.findMany({
          where: {
            dueId: { in: dueIds },
            status: "SUCCEEDED",
            memberId: { not: null },
          },
          select: { id: true, memberId: true, amountPaise: true },
        })
      : [];
    const cancellation = await tx.contributionEventCancellation.create({
      data: {
        eventId: event.id,
        settlementMethod: input.settlementMethod,
        reason: input.reason,
        actorId,
      },
      select: { id: true, externalId: true },
    });
    if (dueIds.length) {
      await tx.due.updateMany({
        where: { id: { in: dueIds }, status: { in: ["PENDING", "OVERDUE", "EXPIRED"] } },
        data: { status: "CANCELLED" },
      });
      // An order that has not been sent to an online provider is safe to close.
      // Orders with a provider ID remain immutable and cannot later settle the
      // cancelled due; their provider reconciliation stays auditable.
      await tx.payment.updateMany({
        where: { dueId: { in: dueIds }, status: "PENDING", providerOrderId: null },
        data: { status: "CANCELLED" },
      });
    }
    if (paidPayments.length) {
      await tx.contributionEventReversal.createMany({
        data: paidPayments.map((payment) => ({
          cancellationId: cancellation.id,
          paymentId: payment.id,
          memberId: payment.memberId!,
          amountPaise: payment.amountPaise,
          method: input.settlementMethod,
        })),
        skipDuplicates: true,
      });
    }
    const cancelledAt = new Date();
    await tx.contributionEvent.update({
      where: { id: event.id },
      data: {
        status: "CANCELLED",
        cancelledAt,
        cancelledById: actorId,
        cancellationReason: input.reason,
      },
    });
    await tx.deathCase.update({
      where: { id: event.deathCase.id },
      data: { status: "CANCELLED" },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "DEATH_SUPPORT_EVENT_CANCELLED",
        entityType: "ContributionEvent",
        entityId: event.id,
        reason: input.reason,
        beforeState: { status: event.status },
        afterState: {
          status: "CANCELLED",
          settlementMethod: input.settlementMethod,
          paidContributionCount: paidPayments.length,
        },
      },
    });
    return { cancellationExternalId: cancellation.externalId, created: true };
  });
}

async function settleWalletEventCancellationReversal(reversalExternalId: string, actorId: string) {
  return runSerializableDeathWorkflow(async (tx) => {
    const reversal = await tx.contributionEventReversal.findUnique({
      where: { externalId: reversalExternalId },
      include: { cancellation: true, payment: { select: { memberId: true } } },
    });
    if (!reversal) throw new Error("Contribution reversal not found");
    if (reversal.status === "SUCCEEDED") return reversal;
    if (reversal.method !== "FOUNDATION_WALLET")
      throw new Error("This reversal uses the original payment method");
    const memberId = reversal.payment.memberId;
    if (!memberId || memberId !== reversal.memberId)
      throw new Error("Contribution payment has no member");
    const wallet = await tx.wallet.upsert({
      where: { memberId },
      update: {},
      create: { memberId },
    });
    const changed = await tx.wallet.updateMany({
      where: { id: wallet.id, version: wallet.version },
      data: { balancePaise: { increment: reversal.amountPaise }, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new Error("Wallet balance changed; retry cancellation");
    const updatedWallet = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        direction: "CREDIT",
        amountPaise: reversal.amountPaise,
        balanceAfterPaise: updatedWallet.balancePaise,
        purpose: "EVENT_CANCELLATION_WALLET_CREDIT",
        relatedExternalId: reversal.externalId,
      },
    });
    const completedAt = new Date();
    const settled = await tx.contributionEventReversal.update({
      where: { id: reversal.id },
      data: { status: "SUCCEEDED", completedAt, failureReason: null },
    });
    await tx.foundationLedger.create({
      data: {
        direction: "DEBIT",
        amountPaise: reversal.amountPaise,
        purpose: "EVENT_CANCELLATION_WALLET_CREDIT",
        relatedExternalId: reversal.externalId,
        authorizedActorId: actorId,
        status: "SUCCEEDED",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "CONTRIBUTION_EVENT_WALLET_CREDIT_SETTLED",
        entityType: "ContributionEventReversal",
        entityId: reversal.id,
        afterState: {
          amountPaise: reversal.amountPaise,
          cancellationExternalId: reversal.cancellation.externalId,
        },
      },
    });
    return settled;
  });
}

async function settleOriginalMethodEventCancellationReversal(
  reversalExternalId: string,
  actorId: string,
) {
  const reversal = await prisma.contributionEventReversal.findUnique({
    where: { externalId: reversalExternalId },
    include: {
      cancellation: true,
      payment: { select: { externalId: true } },
      refund: { select: { id: true, status: true } },
    },
  });
  if (!reversal) throw new Error("Contribution reversal not found");
  if (reversal.status === "SUCCEEDED") return reversal;
  if (reversal.method !== "ORIGINAL_METHOD")
    throw new Error("This reversal uses Foundation Wallet credit");

  try {
    const result = await requestPaymentRefund({
      paymentExternalId: reversal.payment.externalId,
      actorId,
      reason: reversal.cancellation.reason,
      idempotencyKey: `event-cancellation:${reversal.cancellation.externalId}:${reversal.externalId}`,
    });
    const status =
      result.outcome === "SUCCEEDED"
        ? "SUCCEEDED"
        : result.outcome === "FAILED"
          ? "FAILED"
          : "PENDING";
    return prisma.contributionEventReversal.update({
      where: { id: reversal.id },
      data: {
        refundId: result.refund.id,
        status,
        completedAt: status === "SUCCEEDED" ? new Date() : null,
        failureReason:
          status === "FAILED"
            ? "Original-method refund failed"
            : result.outcome === "PROVIDER_UNAVAILABLE"
              ? "Provider refund submission is awaiting configuration"
              : null,
      },
    });
  } catch (error) {
    // Keep the compensating action retryable. The event and original payment
    // remain immutable, while the failure reason gives the Admin a clear queue.
    return prisma.contributionEventReversal.update({
      where: { id: reversal.id },
      data: {
        status: "PENDING",
        failureReason:
          error instanceof Error ? error.message.slice(0, 500) : "Refund submission failed",
      },
    });
  }
}

async function settleEventCancellation(cancellationExternalId: string, actorId: string) {
  const cancellation = await prisma.contributionEventCancellation.findUnique({
    where: { externalId: cancellationExternalId },
    select: {
      settlementMethod: true,
      reversals: {
        where: { status: { not: "SUCCEEDED" } },
        select: { externalId: true },
      },
    },
  });
  if (!cancellation) throw new Error("Event cancellation not found");
  const reversals = await Promise.all(
    cancellation.reversals.map((reversal) =>
      cancellation.settlementMethod === "FOUNDATION_WALLET"
        ? settleWalletEventCancellationReversal(reversal.externalId, actorId)
        : settleOriginalMethodEventCancellationReversal(reversal.externalId, actorId),
    ),
  );
  return reversals.map((reversal) => ({
    externalId: reversal.externalId,
    status: reversal.status,
    failureReason: reversal.failureReason,
  }));
}

/**
 * Event cancellation never rewrites successful payments or receipts. It
 * cancels unpaid dues, then appends one idempotent reversal per settled
 * contribution either through the original-method refund workflow or a
 * Foundation Wallet credit.
 */
export async function cancelDeathSupportEvent(
  eventExternalId: string,
  actorId: string,
  raw: z.input<typeof eventCancellationInput>,
) {
  const input = eventCancellationInput.parse(raw);
  const prepared = await prepareEventCancellation(eventExternalId, actorId, input);
  const reversals = await settleEventCancellation(prepared.cancellationExternalId, actorId);
  return { ...prepared, reversals };
}

const publicEventSelect = {
  externalId: true,
  status: true,
  publishedAt: true,
  publicDetails: true,
  deathCase: {
    select: {
      placeOfDeath: true,
      dateOfDeath: true,
      member: { select: { fullName: true } },
    },
  },
} satisfies Prisma.ContributionEventSelect;

const toPublicEvent = (
  event: Prisma.ContributionEventGetPayload<{ select: typeof publicEventSelect }>,
) => ({
  externalId: event.externalId,
  status: event.status,
  memberName: event.deathCase.member?.fullName ?? "Community member",
  dateOfDeath: event.deathCase.dateOfDeath,
  placeOfDeath: event.deathCase.placeOfDeath,
  publicDetails: event.publicDetails,
  publishedAt: event.publishedAt,
});

/** Public DTO deliberately excludes reporter, nominee, documents, notes, and internal state. */
export async function listPublishedDeathSupportEvents() {
  const events = await prisma.contributionEvent.findMany({
    where: { status: { in: ["PUBLISHED", "CLOSED"] } },
    orderBy: { publishedAt: "desc" },
    select: publicEventSelect,
  });
  return events.map(toPublicEvent);
}

export async function getPublishedDeathSupportEvent(eventExternalId: string) {
  const event = await prisma.contributionEvent.findFirst({
    where: { externalId: eventExternalId, status: { in: ["PUBLISHED", "CLOSED"] } },
    select: publicEventSelect,
  });
  if (!event) throw new Error("Published Death Support Event not found");
  return toPublicEvent(event);
}

const publicCommentSelect = {
  externalId: true,
  body: true,
  createdAt: true,
  user: { select: { member: { select: { fullName: true } } } },
} satisfies Prisma.CommentSelect;

const toPublicComment = (
  comment: Prisma.CommentGetPayload<{ select: typeof publicCommentSelect }>,
) => ({
  externalId: comment.externalId,
  authorName: comment.user.member?.fullName ?? "Community member",
  body: comment.body,
  createdAt: comment.createdAt,
});

export async function listPublishedEventComments(eventExternalId: string) {
  const event = await prisma.contributionEvent.findFirst({
    where: { externalId: eventExternalId, status: { in: ["PUBLISHED", "CLOSED"] } },
    select: { id: true },
  });
  if (!event) throw new Error("Published Death Support Event not found");
  const comments = await prisma.comment.findMany({
    where: { eventId: event.id, status: "PUBLISHED" },
    orderBy: { createdAt: "asc" },
    select: publicCommentSelect,
  });
  return comments.map(toPublicComment);
}

/** Admin moderation can review historical comments even after an event closes. */
export async function listAdminDeathEventComments(eventExternalId: string) {
  const event = await prisma.contributionEvent.findUnique({
    where: { externalId: eventExternalId },
    select: { id: true },
  });
  if (!event) throw new Error("Death Support Event not found");
  const comments = await prisma.comment.findMany({
    where: { eventId: event.id, status: "PUBLISHED" },
    orderBy: { createdAt: "asc" },
    select: publicCommentSelect,
  });
  return comments.map(toPublicComment);
}

export async function addCondolenceComment(
  eventExternalId: string,
  actorId: string,
  raw: z.input<typeof condolenceInput>,
) {
  const input = condolenceInput.parse(raw);
  return runSerializableDeathWorkflow(async (tx) => {
    const [event, author] = await Promise.all([
      tx.contributionEvent.findFirst({
        where: { externalId: eventExternalId, status: "PUBLISHED" },
        select: { id: true },
      }),
      tx.user.findUnique({
        where: { id: actorId },
        select: { member: { select: { status: true, fullName: true } } },
      }),
    ]);
    if (!event) throw new Error("Comments are available only for a published Death Support Event");
    if (!author?.member || ["CLOSED", "DECEASED"].includes(author.member.status))
      throw new Error("An active member account is required to post a condolence");
    const comment = await tx.comment.create({
      data: { eventId: event.id, userId: actorId, body: input.body },
      select: { externalId: true, body: true, createdAt: true },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "DEATH_EVENT_CONDOLENCE_POSTED",
        entityType: "Comment",
        entityId: comment.externalId,
        afterState: { eventExternalId },
      },
    });
    return { ...comment, authorName: author.member.fullName };
  });
}

async function assertCoordinatorMayModerateEvent(
  tx: Prisma.TransactionClient,
  eventExternalId: string,
  actorId: string,
) {
  const [event, coordinator] = await Promise.all([
    tx.contributionEvent.findUnique({
      where: { externalId: eventExternalId },
      select: { id: true, deathCase: { select: { member: { select: { coordinatorId: true } } } } },
    }),
    tx.coordinator.findFirst({
      where: { member: { userId: actorId }, isSuspended: false, status: "ACTIVE" },
      select: { id: true },
    }),
  ]);
  if (!event || !coordinator || event.deathCase.member?.coordinatorId !== coordinator.id)
    throw new Error("Coordinator is not assigned to this Death Support Event");
  return event;
}

export async function listCoordinatorModerationComments(eventExternalId: string, actorId: string) {
  const event = await prisma.$transaction((tx) =>
    assertCoordinatorMayModerateEvent(tx, eventExternalId, actorId),
  );
  const comments = await prisma.comment.findMany({
    where: { eventId: event.id, status: "PUBLISHED" },
    orderBy: { createdAt: "asc" },
    select: publicCommentSelect,
  });
  return comments.map(toPublicComment);
}

export async function listCoordinatorPublishedDeathSupportEvents(actorId: string) {
  const coordinator = await prisma.coordinator.findFirst({
    where: { member: { userId: actorId }, isSuspended: false, status: "ACTIVE" },
    select: { id: true },
  });
  if (!coordinator) throw new Error("Active Coordinator profile is required");
  const events = await prisma.contributionEvent.findMany({
    where: { status: "PUBLISHED", deathCase: { member: { coordinatorId: coordinator.id } } },
    orderBy: { publishedAt: "desc" },
    select: publicEventSelect,
  });
  return events.map(toPublicEvent);
}

export async function listAdminDeathSupportEvents() {
  const events = await prisma.contributionEvent.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    select: {
      externalId: true,
      status: true,
      createdAt: true,
      publishedAt: true,
      closedAt: true,
      cancelledAt: true,
      cancellationReason: true,
      publicDetails: true,
      deathCase: {
        select: {
          externalId: true,
          placeOfDeath: true,
          dateOfDeath: true,
          member: { select: { externalId: true, fullName: true } },
        },
      },
      cancellation: {
        select: {
          externalId: true,
          settlementMethod: true,
          reversals: { select: { externalId: true, status: true, failureReason: true } },
        },
      },
      contributions: { select: { dueId: true } },
    },
  });
  const dueIds = events.flatMap((event) =>
    event.contributions.flatMap((contribution) => (contribution.dueId ? [contribution.dueId] : [])),
  );
  const settledPayments = dueIds.length
    ? await prisma.payment.findMany({
        where: { dueId: { in: dueIds }, status: "SUCCEEDED" },
        select: { dueId: true },
      })
    : [];
  const settledByDueId = new Set(
    settledPayments.flatMap((payment) => (payment.dueId ? [payment.dueId] : [])),
  );
  return events.map(({ contributions, deathCase, ...event }) => ({
    ...event,
    deathCase,
    memberName: deathCase.member?.fullName ?? "Community member",
    placeOfDeath: deathCase.placeOfDeath,
    dateOfDeath: deathCase.dateOfDeath,
    settledContributionCount: contributions.filter(
      (contribution) => contribution.dueId && settledByDueId.has(contribution.dueId),
    ).length,
  }));
}

export async function moderateDeathEventComment(input: {
  eventExternalId: string;
  commentExternalId: string;
  actorId: string;
  role: "ADMIN" | "COORDINATOR";
  reason: string;
}) {
  const validated = commentModerationInput.parse({ reason: input.reason });
  return runSerializableDeathWorkflow(async (tx) => {
    const event =
      input.role === "COORDINATOR"
        ? await assertCoordinatorMayModerateEvent(tx, input.eventExternalId, input.actorId)
        : await tx.contributionEvent.findUnique({
            where: { externalId: input.eventExternalId },
            select: { id: true },
          });
    if (!event) throw new Error("Death Support Event not found");
    const comment = await tx.comment.findFirst({
      where: { externalId: input.commentExternalId, eventId: event.id },
      select: { id: true, status: true },
    });
    if (!comment) throw new Error("Comment not found");
    if (comment.status === "MODERATED")
      return { externalId: input.commentExternalId, status: "MODERATED" as const };
    const moderatedAt = new Date();
    const updated = await tx.comment.update({
      where: { id: comment.id },
      data: {
        status: "MODERATED",
        moderatedAt,
        moderatedById: input.actorId,
        moderationReason: validated.reason,
      },
      select: { externalId: true, status: true, moderatedAt: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "DEATH_EVENT_COMMENT_MODERATED",
        entityType: "Comment",
        entityId: comment.id,
        reason: validated.reason,
        beforeState: { status: comment.status },
        afterState: { status: updated.status, eventExternalId: input.eventExternalId },
      },
    });
    return updated;
  });
}

type DownloadableDeathDocument = {
  contentType: string;
  originalFilename: string;
  bytes: Buffer;
};

export async function downloadDeathDocumentForAdmin(
  caseExternalId: string,
  documentExternalId: string,
  actorId: string,
): Promise<DownloadableDeathDocument> {
  const document = await prisma.deathDocument.findFirst({
    where: { externalId: documentExternalId, deathCase: { externalId: caseExternalId } },
    select: { storageKey: true, contentType: true, originalFilename: true },
  });
  if (!document) throw new Error("Death evidence document not found");
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "DEATH_EVIDENCE_ACCESSED",
      entityType: "DeathDocument",
      entityId: documentExternalId,
      afterState: { access: "ADMIN_DOWNLOAD" },
    },
  });
  return { ...document, bytes: await readDeathEvidence(document.storageKey) };
}

export async function downloadDeathDocumentForCoordinator(
  caseExternalId: string,
  documentExternalId: string,
  actorId: string,
): Promise<DownloadableDeathDocument> {
  const coordinator = await prisma.coordinator.findFirst({
    where: { member: { userId: actorId }, isSuspended: false, status: "ACTIVE" },
    select: { id: true },
  });
  if (!coordinator) throw new Error("Active Coordinator profile is required");
  const document = await prisma.deathDocument.findFirst({
    where: {
      externalId: documentExternalId,
      deathCase: { externalId: caseExternalId, member: { coordinatorId: coordinator.id } },
    },
    select: { storageKey: true, contentType: true, originalFilename: true },
  });
  if (!document) throw new Error("Death evidence document not found");
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "DEATH_EVIDENCE_ACCESSED",
      entityType: "DeathDocument",
      entityId: documentExternalId,
      afterState: { access: "COORDINATOR_DOWNLOAD" },
    },
  });
  return { ...document, bytes: await readDeathEvidence(document.storageKey) };
}
