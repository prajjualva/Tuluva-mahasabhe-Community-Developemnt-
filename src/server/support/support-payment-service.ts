import { Prisma, type SupportCaseStatus } from "@prisma/client";
import { z } from "zod";
import { SCHEME_DEFAULTS } from "../../domain/scheme-settings";
import { prisma } from "../database/prisma";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import {
  assertNomineeSelectionAllowed,
  assertSupportAmount,
  assertSupportPaymentReady,
  evaluateSupportPaymentReadiness,
  restoreStatusAfterResolvedDispute,
  type SupportReadiness,
} from "./support-payment-policy";
import { getSupportTransferProvider } from "./support-transfer-provider";

const uuid = z.string().uuid();
const actorInput = z.object({ actorId: uuid });
const reason = z.string().trim().min(3).max(1_000);
const selectionReason = z.string().trim().min(3).max(1_000).optional();
const idempotencyKey = z.string().trim().min(16).max(200);

const nomineeSelectionInput = actorInput.extend({
  supportCaseExternalId: uuid,
  nomineeExternalId: uuid,
  selectionReason,
});
const documentVerificationInput = actorInput.extend({
  supportCaseExternalId: uuid,
  documentExternalIds: z.array(uuid).min(1).max(50),
  reason,
});
const approvalInput = actorInput.extend({
  supportCaseExternalId: uuid,
  reason: z.string().trim().min(3).max(1_000).optional(),
});
const rejectionInput = actorInput.extend({ supportCaseExternalId: uuid, reason });
const disputeInput = rejectionInput;
const resolutionInput = actorInput.extend({
  supportCaseExternalId: uuid,
  resolution: z.enum(["RESUME", "REJECT"]),
  reason,
  nomineeExternalId: uuid.optional(),
  selectionReason,
});
const paymentCommandInput = actorInput.extend({
  supportCaseExternalId: uuid,
  idempotencyKey,
});
const paymentOutcomeInput = actorInput.extend({
  supportPaymentExternalId: uuid,
  providerReference: z.string().trim().min(3).max(160),
  outcome: z.enum(["SUCCEEDED", "FAILED"]),
});

const adminSupportCaseArgs = Prisma.validator<Prisma.SupportCaseDefaultArgs>()({
  include: {
    deathCase: {
      include: {
        member: {
          include: {
            nominees: {
              select: {
                id: true,
                externalId: true,
                fullName: true,
                relationship: true,
                kind: true,
                status: true,
                isCurrent: true,
                bankEncrypted: true,
                documents: { select: { id: true } },
              },
              orderBy: [{ isCurrent: "desc" }, { kind: "asc" }, { fullName: "asc" }],
            },
          },
        },
        event: { select: { externalId: true, status: true, publishedAt: true } },
        documents: {
          select: {
            id: true,
            externalId: true,
            originalFilename: true,
            contentType: true,
            sizeBytes: true,
            uploadedAt: true,
          },
          orderBy: { uploadedAt: "asc" },
        },
      },
    },
    nominee: {
      select: {
        id: true,
        externalId: true,
        fullName: true,
        relationship: true,
        kind: true,
        status: true,
        isCurrent: true,
        bankEncrypted: true,
        documents: { select: { id: true } },
      },
    },
    payments: {
      select: {
        externalId: true,
        amountPaise: true,
        status: true,
        method: true,
        providerName: true,
        providerReference: true,
        failureReason: true,
        initiatedAt: true,
        settledAt: true,
      },
      orderBy: { initiatedAt: "desc" },
      take: 1,
    },
    disputes: {
      select: {
        externalId: true,
        status: true,
        reason: true,
        openedAt: true,
        resolvedAt: true,
        resolution: true,
      },
      orderBy: { openedAt: "desc" },
    },
    documentVerifications: { select: { deathDocumentId: true, verifiedAt: true } },
  },
});

type AdminSupportCaseRecord = Prisma.SupportCaseGetPayload<typeof adminSupportCaseArgs>;

export type SupportPaymentDto = {
  externalId: string;
  amountPaise: number;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "REFUNDED";
  method: string;
  providerName: string | null;
  providerReference: string | null;
  failureReason: string | null;
  initiatedAt: Date;
  settledAt: Date | null;
};

export type AdminSupportCaseDto = {
  externalId: string;
  status: SupportCaseStatus;
  amountPaise: number;
  createdAt: Date;
  exceptionReason: string | null;
  nomineeSelectionReason: string | null;
  readiness: SupportReadiness;
  deathCase: {
    externalId: string;
    dateOfDeath: Date;
    placeOfDeath: string;
    eligibilityStatus: string;
    eligibilityReason: string | null;
    member: { externalId: string; fullName: string; status: string } | null;
    event: { externalId: string; status: string; publishedAt: Date | null } | null;
  };
  nominees: Array<{
    externalId: string;
    fullName: string;
    relationship: string;
    kind: string;
    status: string;
    isCurrent: boolean;
    hasVerifiedBankDetails: boolean;
    documentCount: number;
  }>;
  nominee: {
    externalId: string;
    fullName: string;
    relationship: string;
    kind: string;
    status: string;
    isCurrent: boolean;
    hasVerifiedBankDetails: boolean;
    documentCount: number;
  } | null;
  documents: Array<{
    externalId: string;
    originalFilename: string;
    contentType: string;
    sizeBytes: number;
    uploadedAt: Date;
    verifiedAt: Date | null;
  }>;
  payment: SupportPaymentDto | null;
  dispute: {
    externalId: string;
    status: string;
    reason: string;
    openedAt: Date;
    resolvedAt: Date | null;
    resolution: string | null;
  } | null;
};

type SupportPaymentRecord = {
  externalId: string;
  amountPaise: number;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "REFUNDED";
  method: string;
  providerName: string | null;
  providerReference: string | null;
  failureReason: string | null;
  initiatedAt: Date;
  settledAt: Date | null;
};

const toSupportPaymentDto = (payment: SupportPaymentRecord): SupportPaymentDto => ({
  externalId: payment.externalId,
  amountPaise: payment.amountPaise,
  status: payment.status,
  method: payment.method,
  providerName: payment.providerName,
  providerReference: payment.providerReference,
  failureReason: payment.failureReason,
  initiatedAt: payment.initiatedAt,
  settledAt: payment.settledAt,
});

const safeNominee = (nominee: {
  externalId: string;
  fullName: string;
  relationship: string;
  kind: string;
  status: string;
  isCurrent: boolean;
  bankEncrypted: Prisma.JsonValue | null;
  documents: Array<{ id: string }>;
}) => ({
  externalId: nominee.externalId,
  fullName: nominee.fullName,
  relationship: nominee.relationship,
  kind: nominee.kind,
  status: nominee.status,
  isCurrent: nominee.isCurrent,
  hasVerifiedBankDetails:
    nominee.status === "VERIFIED" && nominee.isCurrent && nominee.bankEncrypted !== null,
  documentCount: nominee.documents.length,
});

function toAdminSupportCaseDto(supportCase: AdminSupportCaseRecord): AdminSupportCaseDto {
  const documents = supportCase.deathCase.documents;
  const verificationByDocumentId = new Map(
    supportCase.documentVerifications.map((verification) => [
      verification.deathDocumentId,
      verification.verifiedAt,
    ]),
  );
  const selectedNominee = supportCase.nominee;
  const openDispute = supportCase.disputes.find((dispute) => dispute.status === "OPEN");
  const readiness = evaluateSupportPaymentReadiness({
    eventStatus: supportCase.deathCase.event?.status ?? null,
    eventPublishedAt: supportCase.deathCase.event?.publishedAt ?? null,
    dateOfDeath: supportCase.deathCase.dateOfDeath,
    deathDateVerifiedAt: supportCase.deathCase.adminVerifiedAt,
    eligibilityStatus: supportCase.deathCase.eligibilityStatus,
    documentCount: documents.length,
    verifiedDocumentCount: documents.filter((document) => verificationByDocumentId.has(document.id))
      .length,
    documentsVerifiedAt: supportCase.documentsVerifiedAt,
    nominee: selectedNominee
      ? {
          kind: selectedNominee.kind,
          status: selectedNominee.status,
          isCurrent: selectedNominee.isCurrent,
          hasEncryptedBankDetails: selectedNominee.bankEncrypted !== null,
        }
      : null,
    nomineeVerifiedAt: supportCase.nomineeVerifiedAt,
    bankVerifiedAt: supportCase.bankVerifiedAt,
    disputeOpen: Boolean(openDispute),
  });
  const latestPayment = supportCase.payments[0] ?? null;
  const latestDispute = supportCase.disputes[0] ?? null;
  return {
    externalId: supportCase.externalId,
    status: supportCase.status,
    amountPaise: supportCase.amountPaise,
    createdAt: supportCase.createdAt,
    exceptionReason: supportCase.exceptionReason,
    nomineeSelectionReason: supportCase.nomineeSelectionReason,
    readiness,
    deathCase: {
      externalId: supportCase.deathCase.externalId,
      dateOfDeath: supportCase.deathCase.dateOfDeath,
      placeOfDeath: supportCase.deathCase.placeOfDeath,
      eligibilityStatus: supportCase.deathCase.eligibilityStatus,
      eligibilityReason: supportCase.deathCase.eligibilityReason,
      member: supportCase.deathCase.member
        ? {
            externalId: supportCase.deathCase.member.externalId,
            fullName: supportCase.deathCase.member.fullName,
            status: supportCase.deathCase.member.status,
          }
        : null,
      event: supportCase.deathCase.event,
    },
    nominees: supportCase.deathCase.member?.nominees.map(safeNominee) ?? [],
    nominee: selectedNominee ? safeNominee(selectedNominee) : null,
    documents: documents.map((document) => ({
      externalId: document.externalId,
      originalFilename: document.originalFilename,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      uploadedAt: document.uploadedAt,
      verifiedAt: verificationByDocumentId.get(document.id) ?? null,
    })),
    payment: latestPayment ? toSupportPaymentDto(latestPayment) : null,
    dispute: latestDispute,
  };
}

/**
 * Scheme settings are versioned. The policy itself currently locks support at
 * ₹1,00,000, so a malformed or altered setting fails closed rather than
 * changing a payout amount from the browser or a scattered source constant.
 */
async function effectiveSupportAmountPaise(tx: Prisma.TransactionClient, at = new Date()) {
  const version = await tx.schemeSettingVersion.findFirst({
    where: { setting: { key: "supportPaymentPaise" }, effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: "desc" },
    select: { value: true },
  });
  const amount = version ? version.value : SCHEME_DEFAULTS.supportPaymentPaise;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount))
    throw new Error("The Community Support payment policy is invalid");
  assertSupportAmount(amount);
  return amount;
}

function safeEligibilitySnapshot(input: {
  deathCaseExternalId: string;
  eventExternalId: string;
  eventStatus: string;
  dateOfDeath: Date;
  eligibilityStatus: string;
  eligibilityReason: string | null;
}) {
  // This snapshot intentionally contains no reporter, nominee, bank, document
  // storage key, address, or other restricted information.
  return {
    version: 1,
    deathCaseExternalId: input.deathCaseExternalId,
    eventExternalId: input.eventExternalId,
    eventStatus: input.eventStatus,
    dateOfDeath: input.dateOfDeath.toISOString(),
    eligibilityStatus: input.eligibilityStatus,
    eligibilityReason: input.eligibilityReason,
  } as Prisma.InputJsonValue;
}

async function materializeSupportCases() {
  return runSerializablePaymentTransaction(async (tx) => {
    const candidates = await tx.deathCase.findMany({
      where: { status: "APPROVED" },
      select: {
        id: true,
        externalId: true,
        dateOfDeath: true,
        eligibilityStatus: true,
        eligibilityReason: true,
        event: { select: { externalId: true, status: true } },
        supportCase: { select: { id: true } },
      },
    });
    const missing = candidates.filter((candidate) => candidate.event && !candidate.supportCase);
    if (!missing.length) return 0;
    const amountPaise = await effectiveSupportAmountPaise(tx);
    const created = await tx.supportCase.createMany({
      data: missing.map((candidate) => ({
        deathCaseId: candidate.id,
        amountPaise,
        status: "REVIEW",
        eligibilitySnapshot: safeEligibilitySnapshot({
          deathCaseExternalId: candidate.externalId,
          eventExternalId: candidate.event!.externalId,
          eventStatus: candidate.event!.status,
          dateOfDeath: candidate.dateOfDeath,
          eligibilityStatus: candidate.eligibilityStatus,
          eligibilityReason: candidate.eligibilityReason,
        }),
      })),
      skipDuplicates: true,
    });
    if (created.count) {
      await tx.auditLog.create({
        data: {
          actorRole: "SYSTEM",
          action: "SUPPORT_CASES_MATERIALIZED",
          entityType: "SupportCase",
          entityId: "SYSTEM",
          afterState: { createdCount: created.count },
        },
      });
    }
    return created.count;
  });
}

async function findAdminSupportCase(supportCaseExternalId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  const supportCase = await client.supportCase.findUnique({
    where: { externalId: supportCaseExternalId },
    ...adminSupportCaseArgs,
  });
  if (!supportCase) throw new Error("Support case not found");
  return supportCase;
}

export async function listAdminSupportCases(): Promise<{ cases: AdminSupportCaseDto[] }> {
  await materializeSupportCases();
  const supportCases = await prisma.supportCase.findMany({
    ...adminSupportCaseArgs,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return { cases: supportCases.map(toAdminSupportCaseDto) };
}

export async function getAdminSupportCase(
  supportCaseExternalId: string,
): Promise<AdminSupportCaseDto> {
  uuid.parse(supportCaseExternalId);
  const supportCase = await findAdminSupportCase(supportCaseExternalId);
  return toAdminSupportCaseDto(supportCase);
}

function assertMutableSupportCase(status: SupportCaseStatus): void {
  if (["PAID", "REJECTED", "FROZEN_DISPUTE"].includes(status))
    throw new Error("This support case can no longer be changed");
}

function reviewStatusAfterGateChange(status: SupportCaseStatus): SupportCaseStatus {
  return status === "APPROVED" ? "REVIEW" : status;
}

export async function selectSupportNominee(raw: z.input<typeof nomineeSelectionInput>) {
  const input = nomineeSelectionInput.parse(raw);
  return runSerializablePaymentTransaction(async (tx) => {
    const supportCase = await findAdminSupportCase(input.supportCaseExternalId, tx);
    assertMutableSupportCase(supportCase.status);
    const nominee = supportCase.deathCase.member?.nominees.find(
      (candidate) => candidate.externalId === input.nomineeExternalId,
    );
    if (!nominee) throw new Error("Nominee does not belong to the deceased member");
    assertNomineeSelectionAllowed(
      {
        kind: nominee.kind,
        status: nominee.status,
        isCurrent: nominee.isCurrent,
        hasEncryptedBankDetails: nominee.bankEncrypted !== null,
      },
      input.selectionReason,
    );
    const now = new Date();
    const updated = await tx.supportCase.update({
      where: { id: supportCase.id },
      data: {
        nomineeId: nominee.id,
        nomineeSelectionReason: input.selectionReason?.trim() || null,
        nomineeVerifiedAt: now,
        nomineeVerifiedById: input.actorId,
        bankVerifiedAt: now,
        bankVerifiedById: input.actorId,
        status: reviewStatusAfterGateChange(supportCase.status),
      },
      ...adminSupportCaseArgs,
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "SUPPORT_NOMINEE_SELECTED_AND_BANK_VERIFIED",
        entityType: "SupportCase",
        entityId: supportCase.id,
        reason: input.selectionReason?.trim() || undefined,
        beforeState: {
          nomineeExternalId: supportCase.nominee?.externalId ?? null,
          status: supportCase.status,
        },
        afterState: {
          nomineeExternalId: nominee.externalId,
          nomineeKind: nominee.kind,
          status: updated.status,
        },
      },
    });
    return toAdminSupportCaseDto(updated);
  });
}

export async function verifySupportDocuments(raw: z.input<typeof documentVerificationInput>) {
  const input = documentVerificationInput.parse(raw);
  return runSerializablePaymentTransaction(async (tx) => {
    const supportCase = await findAdminSupportCase(input.supportCaseExternalId, tx);
    assertMutableSupportCase(supportCase.status);
    const expectedDocumentIds = new Set(
      supportCase.deathCase.documents.map((document) => document.externalId),
    );
    const suppliedDocumentIds = new Set(input.documentExternalIds);
    if (!expectedDocumentIds.size)
      throw new Error("At least one restricted death evidence document is required");
    if (
      suppliedDocumentIds.size !== expectedDocumentIds.size ||
      [...expectedDocumentIds].some((documentId) => !suppliedDocumentIds.has(documentId))
    )
      throw new Error("All currently attached death evidence documents must be verified");

    const now = new Date();
    await tx.supportDocumentVerification.createMany({
      data: supportCase.deathCase.documents.map((document) => ({
        supportCaseId: supportCase.id,
        deathDocumentId: document.id,
        verifiedById: input.actorId,
        verifiedAt: now,
      })),
      skipDuplicates: true,
    });
    const updated = await tx.supportCase.update({
      where: { id: supportCase.id },
      data: {
        documentsVerifiedAt: now,
        documentsVerifiedById: input.actorId,
        status: reviewStatusAfterGateChange(supportCase.status),
      },
      ...adminSupportCaseArgs,
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "SUPPORT_REQUIRED_DOCUMENTS_VERIFIED",
        entityType: "SupportCase",
        entityId: supportCase.id,
        reason: input.reason,
        afterState: { documentCount: expectedDocumentIds.size, status: updated.status },
      },
    });
    return toAdminSupportCaseDto(updated);
  });
}

function assertSupportCaseCanApprove(status: SupportCaseStatus) {
  if (status === "APPROVED") return;
  if (status !== "REVIEW") throw new Error("Support case is not ready for Admin approval");
}

export async function approveSupportCase(raw: z.input<typeof approvalInput>) {
  const input = approvalInput.parse(raw);
  return runSerializablePaymentTransaction(async (tx) => {
    const supportCase = await findAdminSupportCase(input.supportCaseExternalId, tx);
    assertSupportCaseCanApprove(supportCase.status);
    const before = toAdminSupportCaseDto(supportCase);
    assertSupportAmount(supportCase.amountPaise);
    assertSupportPaymentReady(before.readiness);
    const now = new Date();
    const updated = await tx.supportCase.update({
      where: { id: supportCase.id },
      data: { status: "APPROVED", approvedAt: now, approvedById: input.actorId },
      ...adminSupportCaseArgs,
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "SUPPORT_CASE_APPROVED",
        entityType: "SupportCase",
        entityId: supportCase.id,
        reason: input.reason?.trim() || undefined,
        beforeState: { status: supportCase.status, missing: before.readiness.missing },
        afterState: { status: updated.status, amountPaise: updated.amountPaise },
      },
    });
    return toAdminSupportCaseDto(updated);
  });
}

async function rejectSupportCaseInTransaction(
  tx: Prisma.TransactionClient,
  supportCase: AdminSupportCaseRecord,
  actorId: string,
  rejectionReason: string,
  action: "SUPPORT_CASE_REJECTED" | "SUPPORT_DISPUTE_RESOLVED_REJECTED",
) {
  if (supportCase.status === "PAID")
    throw new Error("A settled support payment cannot be rejected");
  const now = new Date();
  await tx.supportPayment.updateMany({
    where: { supportCaseId: supportCase.id, status: "PENDING" },
    data: { status: "CANCELLED", failureReason: "Support case rejected before settlement" },
  });
  const updated = await tx.supportCase.update({
    where: { id: supportCase.id },
    data: {
      status: "REJECTED",
      rejectedAt: now,
      rejectedById: actorId,
      rejectionReason,
      statusBeforeFreeze: null,
    },
    ...adminSupportCaseArgs,
  });
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entityType: "SupportCase",
      entityId: supportCase.id,
      reason: rejectionReason,
      beforeState: { status: supportCase.status },
      afterState: { status: updated.status },
    },
  });
  return updated;
}

export async function rejectSupportCase(raw: z.input<typeof rejectionInput>) {
  const input = rejectionInput.parse(raw);
  return runSerializablePaymentTransaction(async (tx) => {
    const supportCase = await findAdminSupportCase(input.supportCaseExternalId, tx);
    if (supportCase.status === "REJECTED") return toAdminSupportCaseDto(supportCase);
    if (supportCase.status === "FROZEN_DISPUTE")
      throw new Error("Resolve the nominee dispute before rejecting support");
    return toAdminSupportCaseDto(
      await rejectSupportCaseInTransaction(
        tx,
        supportCase,
        input.actorId,
        input.reason,
        "SUPPORT_CASE_REJECTED",
      ),
    );
  });
}

export async function openSupportDispute(raw: z.input<typeof disputeInput>) {
  const input = disputeInput.parse(raw);
  return runSerializablePaymentTransaction(async (tx) => {
    const supportCase = await findAdminSupportCase(input.supportCaseExternalId, tx);
    if (["PAID", "REJECTED"].includes(supportCase.status))
      throw new Error("A completed support case cannot be frozen for dispute");
    const existing = supportCase.disputes.find((dispute) => dispute.status === "OPEN");
    if (existing) return toAdminSupportCaseDto(supportCase);

    const now = new Date();
    await tx.supportPayment.updateMany({
      where: { supportCaseId: supportCase.id, status: "PENDING" },
      data: { status: "CANCELLED", failureReason: "Frozen by nominee dispute before settlement" },
    });
    await tx.supportDispute.create({
      data: {
        supportCaseId: supportCase.id,
        reason: input.reason,
        openedById: input.actorId,
        openedAt: now,
      },
    });
    const updated = await tx.supportCase.update({
      where: { id: supportCase.id },
      data: {
        status: "FROZEN_DISPUTE",
        frozenAt: now,
        statusBeforeFreeze: supportCase.status,
      },
      ...adminSupportCaseArgs,
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "SUPPORT_NOMINEE_DISPUTE_OPENED",
        entityType: "SupportCase",
        entityId: supportCase.id,
        reason: input.reason,
        beforeState: { status: supportCase.status },
        afterState: { status: updated.status },
      },
    });
    return toAdminSupportCaseDto(updated);
  });
}

export async function resolveSupportDispute(raw: z.input<typeof resolutionInput>) {
  const input = resolutionInput.parse(raw);
  return runSerializablePaymentTransaction(async (tx) => {
    const supportCase = await findAdminSupportCase(input.supportCaseExternalId, tx);
    if (supportCase.status !== "FROZEN_DISPUTE")
      throw new Error("Support case is not frozen for dispute");
    const dispute = supportCase.disputes.find((candidate) => candidate.status === "OPEN");
    if (!dispute) throw new Error("Open nominee dispute not found");
    const now = new Date();
    await tx.supportDispute.update({
      where: { externalId: dispute.externalId },
      data: {
        status: "RESOLVED",
        resolvedById: input.actorId,
        resolvedAt: now,
        resolution: `${input.resolution}: ${input.reason}`,
      },
    });

    if (input.resolution === "REJECT") {
      const rejected = await rejectSupportCaseInTransaction(
        tx,
        supportCase,
        input.actorId,
        input.reason,
        "SUPPORT_DISPUTE_RESOLVED_REJECTED",
      );
      return toAdminSupportCaseDto(rejected);
    }

    let nomineeUpdate: Prisma.SupportCaseUpdateInput = {};
    if (input.nomineeExternalId) {
      const nominee = supportCase.deathCase.member?.nominees.find(
        (candidate) => candidate.externalId === input.nomineeExternalId,
      );
      if (!nominee) throw new Error("Nominee does not belong to the deceased member");
      assertNomineeSelectionAllowed(
        {
          kind: nominee.kind,
          status: nominee.status,
          isCurrent: nominee.isCurrent,
          hasEncryptedBankDetails: nominee.bankEncrypted !== null,
        },
        input.selectionReason,
      );
      nomineeUpdate = {
        nominee: { connect: { id: nominee.id } },
        nomineeSelectionReason: input.selectionReason?.trim() || null,
        nomineeVerifiedAt: now,
        nomineeVerifiedById: input.actorId,
        bankVerifiedAt: now,
        bankVerifiedById: input.actorId,
      };
    }
    const updated = await tx.supportCase.update({
      where: { id: supportCase.id },
      data: {
        ...nomineeUpdate,
        status: restoreStatusAfterResolvedDispute(supportCase.statusBeforeFreeze),
        statusBeforeFreeze: null,
      },
      ...adminSupportCaseArgs,
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "SUPPORT_NOMINEE_DISPUTE_RESOLVED",
        entityType: "SupportCase",
        entityId: supportCase.id,
        reason: input.reason,
        beforeState: { status: supportCase.status, disputeExternalId: dispute.externalId },
        afterState: {
          status: updated.status,
          nomineeExternalId: updated.nominee?.externalId ?? null,
        },
      },
    });
    return toAdminSupportCaseDto(updated);
  });
}

async function createSupportPaymentCommand(
  input: z.infer<typeof paymentCommandInput>,
  kind: "INITIATED" | "RETRIED",
) {
  // Scope a caller's opaque key to the financial command being performed.
  // A stale initiate key must never be accepted as a retry command (or vice
  // versa), while repeated delivery of the same command remains harmless.
  const commandIdempotencyKey = `support:${kind.toLowerCase()}:${input.actorId}:${input.idempotencyKey}`;
  const result = await runSerializablePaymentTransaction(async (tx) => {
    const replay = await tx.supportPayment.findUnique({
      where: { idempotencyKey: commandIdempotencyKey },
      include: { supportCase: { select: { externalId: true } } },
    });
    if (replay) {
      if (replay.supportCase.externalId !== input.supportCaseExternalId)
        throw new Error("Idempotency key is already in use");
      return { payment: replay, replayed: true };
    }
    const supportCase = await findAdminSupportCase(input.supportCaseExternalId, tx);
    const expectedStatus = kind === "INITIATED" ? "APPROVED" : "PAYMENT_FAILED";
    if (supportCase.status !== expectedStatus)
      throw new Error(
        kind === "INITIATED"
          ? "Admin approval is required before initiating support payment"
          : "Only a failed support payment can be manually retried",
      );
    assertSupportAmount(supportCase.amountPaise);
    assertSupportPaymentReady(toAdminSupportCaseDto(supportCase).readiness);
    const pending = await tx.supportPayment.findFirst({
      where: { supportCaseId: supportCase.id, status: "PENDING" },
      select: { externalId: true },
    });
    if (pending) throw new Error("A support transfer is already pending");
    const payment = await tx.supportPayment.create({
      data: {
        supportCaseId: supportCase.id,
        amountPaise: supportCase.amountPaise,
        method: "MANUAL_BANK_TRANSFER",
        idempotencyKey: commandIdempotencyKey,
        initiatedById: input.actorId,
      },
    });
    await tx.supportCase.update({
      where: { id: supportCase.id },
      data: { status: "PAYMENT_PENDING" },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: kind === "INITIATED" ? "SUPPORT_PAYMENT_INITIATED" : "SUPPORT_PAYMENT_RETRIED",
        entityType: "SupportPayment",
        entityId: payment.id,
        afterState: {
          supportCaseExternalId: supportCase.externalId,
          amountPaise: payment.amountPaise,
        },
      },
    });
    return { payment, replayed: false };
  });
  return result;
}

type SupportPaymentCommandResult = {
  payment: SupportPaymentDto;
  outcome: "MANUAL_SETTLEMENT_REQUIRED" | "PENDING_PROVIDER";
  replayed: boolean;
};

async function commandSupportPayment(
  raw: z.input<typeof paymentCommandInput>,
  kind: "INITIATED" | "RETRIED",
): Promise<SupportPaymentCommandResult> {
  const input = paymentCommandInput.parse(raw);
  const result = await createSupportPaymentCommand(input, kind);
  const provider = getSupportTransferProvider();
  return {
    payment: toSupportPaymentDto(result.payment),
    // A real adapter would submit only after loading the encrypted bank record
    // through the server-only authorization boundary below. No configured
    // adapter means the Administrator must record a genuine transfer outcome.
    outcome: provider.available ? "PENDING_PROVIDER" : "MANUAL_SETTLEMENT_REQUIRED",
    replayed: result.replayed,
  };
}

/** Creates one persisted, un-settled payout command; it never fabricates success. */
export async function initiateSupportPayment(raw: z.input<typeof paymentCommandInput>) {
  return commandSupportPayment(raw, "INITIATED");
}

/** A failed payout can only be retried by an explicit new Admin command. */
export async function retrySupportPayment(raw: z.input<typeof paymentCommandInput>) {
  return commandSupportPayment(raw, "RETRIED");
}

export async function recordSupportPaymentProviderOutcome(
  raw: z.input<typeof paymentOutcomeInput>,
) {
  const input = paymentOutcomeInput.parse(raw);
  return runSerializablePaymentTransaction(async (tx) => {
    const payment = await tx.supportPayment.findUnique({
      where: { externalId: input.supportPaymentExternalId },
      include: { supportCase: true },
    });
    if (!payment) throw new Error("Support payment not found");
    assertSupportAmount(payment.amountPaise);
    if (payment.status === "SUCCEEDED" || payment.status === "FAILED") {
      if (payment.providerReference !== input.providerReference)
        throw new Error("Transfer reference does not match the settled outcome");
      if (payment.status !== input.outcome) throw new Error("Transfer outcome is immutable");
      return {
        payment: toSupportPaymentDto(payment),
        supportCase: {
          externalId: payment.supportCase.externalId,
          status: payment.supportCase.status,
        },
        alreadyRecorded: true,
      };
    }
    if (payment.status !== "PENDING") throw new Error("Support payment outcome is immutable");
    const duplicateReference = await tx.supportPayment.findFirst({
      where: { providerReference: input.providerReference, NOT: { id: payment.id } },
      select: { externalId: true },
    });
    if (duplicateReference) throw new Error("Transfer reference is already recorded");

    if (input.outcome === "FAILED") {
      if (payment.supportCase.status !== "PAYMENT_PENDING")
        throw new Error("Support payment is not permitted while the case is frozen or closed");
      const failed = await tx.supportPayment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          providerReference: input.providerReference,
          failureReason: "Provider or bank transfer reported failure",
          settledAt: new Date(),
        },
      });
      const supportCase = await tx.supportCase.update({
        where: { id: payment.supportCaseId },
        data: { status: "PAYMENT_FAILED" },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "SUPPORT_PAYMENT_FAILED",
          entityType: "SupportPayment",
          entityId: payment.id,
          afterState: { providerReference: input.providerReference },
        },
      });
      return {
        payment: toSupportPaymentDto(failed),
        supportCase: { externalId: supportCase.externalId, status: supportCase.status },
        alreadyRecorded: false,
      };
    }

    const supportCase = await findAdminSupportCase(payment.supportCase.externalId, tx);
    if (supportCase.status !== "PAYMENT_PENDING")
      throw new Error("Support payment is not permitted while the case is frozen or closed");
    assertSupportPaymentReady(toAdminSupportCaseDto(supportCase).readiness);
    const settledAt = new Date();
    const settled = await tx.supportPayment.update({
      where: { id: payment.id },
      data: { status: "SUCCEEDED", providerReference: input.providerReference, settledAt },
    });
    const paidCase = await tx.supportCase.update({
      where: { id: supportCase.id },
      data: { status: "PAID" },
    });
    await tx.foundationLedger.create({
      data: {
        direction: "DEBIT",
        amountPaise: settled.amountPaise,
        purpose: "COMMUNITY_SUPPORT_PAYMENT",
        relatedExternalId: settled.externalId,
        authorizedActorId: input.actorId,
        reference: input.providerReference,
        status: "SUCCEEDED",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "SUPPORT_PAYMENT_SETTLED",
        entityType: "SupportPayment",
        entityId: settled.id,
        afterState: {
          supportCaseExternalId: paidCase.externalId,
          amountPaise: settled.amountPaise,
          providerReference: input.providerReference,
        },
      },
    });
    return {
      payment: toSupportPaymentDto(settled),
      supportCase: { externalId: paidCase.externalId, status: paidCase.status },
      alreadyRecorded: false,
    };
  });
}

/**
 * Server-only boundary for a future bank-transfer adapter. UI/API DTOs never
 * call this and `AdminSupportCaseDto` deliberately strips the encrypted blob.
 */
export async function loadAuthorizedEncryptedSupportBankRecord(input: {
  supportCaseExternalId: string;
  actorId: string;
}) {
  const parsed = z.object({ supportCaseExternalId: uuid, actorId: uuid }).parse(input);
  const actor = await prisma.user.findUnique({
    where: { id: parsed.actorId },
    select: {
      status: true,
      roles: {
        where: { active: true },
        select: {
          role: { select: { permissions: { select: { permission: { select: { code: true } } } } } },
        },
      },
    },
  });
  const permissions = new Set(
    actor?.roles.flatMap((assignment) =>
      assignment.role.permissions.map((entry) => entry.permission.code),
    ) ?? [],
  );
  if (
    !actor ||
    actor.status !== "ACTIVE" ||
    (!permissions.has("admin:*") && !permissions.has("nominee:bank:verify"))
  )
    throw new Error("Restricted nominee bank access is denied");
  const supportCase = await prisma.supportCase.findUnique({
    where: { externalId: parsed.supportCaseExternalId },
    select: {
      nominee: { select: { externalId: true, bankEncrypted: true, status: true, isCurrent: true } },
      bankVerifiedAt: true,
    },
  });
  if (
    !supportCase?.nominee ||
    supportCase.nominee.status !== "VERIFIED" ||
    !supportCase.nominee.isCurrent ||
    !supportCase.bankVerifiedAt ||
    !supportCase.nominee.bankEncrypted
  )
    throw new Error("Verified nominee bank details are not available");
  return {
    nomineeExternalId: supportCase.nominee.externalId,
    encryptedBankRecord: supportCase.nominee.bankEncrypted,
  };
}
