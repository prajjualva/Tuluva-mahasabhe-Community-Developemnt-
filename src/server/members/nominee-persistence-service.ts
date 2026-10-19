import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/prisma";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";
import {
  bankDetailsSchema,
  decryptSensitiveRecord,
  encryptSensitiveRecord,
} from "../security/bank-encryption";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";
import { readCashEvidence } from "../coordinators/cash-evidence";

const nomineeSelect = {
  externalId: true,
  kind: true,
  fullName: true,
  relationship: true,
  status: true,
  isCurrent: true,
  documents: {
    select: {
      externalId: true,
      originalFilename: true,
      contentType: true,
      sizeBytes: true,
      uploadedAt: true,
    },
  },
} satisfies Prisma.NomineeSelect;
const commandSchema = z
  .object({
    kind: z.enum(["PRIMARY", "SECONDARY"]),
    fullName: z.string().trim().min(2).max(160),
    relationship: z.string().trim().min(2).max(80),
    contactDetails: z
      .object({
        mobile: z
          .string()
          .regex(/^\+[1-9]\d{7,14}$/)
          .optional(),
        email: z.string().email().max(254).optional(),
      })
      .strict(),
    bankDetails: bankDetailsSchema,
    identification: z
      .object({
        documentType: z.string().trim().min(2).max(80),
        reference: z.string().trim().min(3).max(100),
      })
      .strict()
      .optional(),
    replacesNomineeExternalId: z.string().uuid().optional(),
  })
  .strict();

async function ownedMember(tx: Prisma.TransactionClient, userId: string) {
  const member = await tx.member.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (!member) throw new Error("Member not found");
  return member;
}
export async function listMemberNominees(userId: string) {
  const member = await ownedMember(prisma, userId);
  return prisma.nominee.findMany({
    where: { memberId: member.id },
    select: nomineeSelect,
    orderBy: [{ isCurrent: "desc" }, { kind: "asc" }],
    take: 100,
  });
}
export async function submitNominee(userId: string, input: unknown) {
  const command = commandSchema.parse(input);
  const bankEncrypted = encryptSensitiveRecord(command.bankDetails);
  const identificationEncrypted = command.identification
    ? encryptSensitiveRecord(command.identification)
    : undefined;
  return runSerializablePaymentTransaction(async (tx) => {
    const member = await ownedMember(tx, userId);
    if (["DECEASED", "CLOSED"].includes(member.status))
      throw new Error("Nominee changes are unavailable for this membership");
    const previous = command.replacesNomineeExternalId
      ? await tx.nominee.findFirst({
          where: {
            memberId: member.id,
            externalId: command.replacesNomineeExternalId,
            isCurrent: true,
            status: "VERIFIED",
            kind: command.kind,
          },
        })
      : null;
    if (command.replacesNomineeExternalId && !previous)
      throw new Error("Current nominee not found");
    if (
      !previous &&
      command.kind === "PRIMARY" &&
      (await tx.nominee.count({ where: { memberId: member.id, kind: "PRIMARY", isCurrent: true } }))
    )
      throw new Error("Select the existing Primary Nominee to request a replacement");
    if (
      await tx.nominee.count({
        where: {
          memberId: member.id,
          kind: command.kind,
          status: "PENDING_VERIFICATION",
          replacesNomineeId: previous?.id ?? null,
        },
      })
    )
      throw new Error("A nominee change is already awaiting verification");
    const nominee = await tx.nominee.create({
      data: {
        memberId: member.id,
        kind: command.kind,
        fullName: command.fullName,
        relationship: command.relationship,
        contactDetails: command.contactDetails,
        bankEncrypted,
        identificationEncrypted,
        status: "PENDING_VERIFICATION",
        isCurrent: false,
        replacesNomineeId: previous?.id,
      },
      select: nomineeSelect,
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "NOMINEE_SUBMITTED_FOR_VERIFICATION",
        entityType: "Nominee",
        entityId: nominee.externalId,
        afterState: {
          nomineeExternalId: nominee.externalId,
          kind: command.kind,
          replacesNomineeExternalId: command.replacesNomineeExternalId ?? null,
        },
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId,
      type: "NOMINEE_VERIFICATION",
      title: "Nominee awaiting verification",
      body: "Your nominee submission is pending Foundation verification. Any previously verified nominee remains valid until this change is approved.",
      relatedExternalId: nominee.externalId,
      idempotencyKey: `nominee-pending:${nominee.externalId}`,
    });
    return nominee;
  });
}

export async function listNomineesForVerification(actorId: string, admin: boolean) {
  return prisma.nominee.findMany({
    where: {
      status: "PENDING_VERIFICATION",
      ...(!admin
        ? {
            member: {
              coordinator: { member: { userId: actorId }, isSuspended: false, status: "ACTIVE" },
            },
          }
        : {}),
    },
    select: { ...nomineeSelect, member: { select: { externalId: true, fullName: true } } },
    take: 100,
  });
}
async function assertNomineeReviewer(
  tx: Prisma.TransactionClient,
  actorId: string,
  nomineeExternalId: string,
  admin: boolean,
) {
  const nominee = await tx.nominee.findFirst({
    where: {
      externalId: nomineeExternalId,
      ...(!admin
        ? {
            member: {
              coordinator: { member: { userId: actorId }, isSuspended: false, status: "ACTIVE" },
            },
          }
        : {}),
    },
    include: { member: { select: { userId: true } }, documents: { select: { id: true } } },
  });
  if (!nominee) throw new Error("Nominee not found");
  return nominee;
}
export async function readNomineeBankForVerification(
  actorId: string,
  externalId: string,
  admin: boolean,
  reason: string,
) {
  z.string().uuid().parse(externalId);
  z.string().trim().min(3).max(1000).parse(reason);
  return runSerializablePaymentTransaction(async (tx) => {
    const nominee = await assertNomineeReviewer(tx, actorId, externalId, admin);
    const details = bankDetailsSchema.parse(decryptSensitiveRecord(nominee.bankEncrypted));
    await tx.auditLog.create({
      data: {
        actorId,
        action: "NOMINEE_BANK_DETAILS_REVIEWED",
        entityType: "Nominee",
        entityId: nominee.id,
        reason,
      },
    });
    return details;
  });
}
export async function verifyNominee(
  actorId: string,
  externalId: string,
  admin: boolean,
  input: unknown,
) {
  z.string().uuid().parse(externalId);
  const command = z
    .object({ approved: z.boolean(), reason: z.string().trim().min(3).max(1000) })
    .strict()
    .parse(input);
  return runSerializablePaymentTransaction(async (tx) => {
    const nominee = await assertNomineeReviewer(tx, actorId, externalId, admin);
    if (nominee.status !== "PENDING_VERIFICATION")
      throw new Error("Nominee has already been reviewed");
    if (
      await tx.supportCase.count({
        where: {
          deathCase: { memberId: nominee.memberId },
          status: { in: ["APPROVED", "PAYMENT_PENDING", "FROZEN_DISPUTE"] },
        },
      })
    )
      throw new Error("Resolve the support case before changing the verified nominee");
    if (command.approved) {
      bankDetailsSchema.parse(decryptSensitiveRecord(nominee.bankEncrypted));
      if (
        !(await tx.auditLog.findFirst({
          where: { action: "NOMINEE_BANK_DETAILS_REVIEWED", entityId: nominee.id },
        }))
      )
        throw new Error("Authorized bank review is required before verification");
      if (!nominee.documents.length)
        throw new Error("Nominee evidence is required before verification");
      if (nominee.kind === "PRIMARY") {
        const current = await tx.nominee.findFirst({
          where: {
            memberId: nominee.memberId,
            kind: "PRIMARY",
            isCurrent: true,
            status: "VERIFIED",
          },
        });
        if (current && current.id !== nominee.replacesNomineeId)
          throw new Error("Primary Nominee changed; submit a new replacement request");
      }
      if (nominee.replacesNomineeId)
        await tx.nominee.updateMany({
          where: { id: nominee.replacesNomineeId, memberId: nominee.memberId, isCurrent: true },
          data: { isCurrent: false, status: "INACTIVE" },
        });
    }
    const result = await tx.nominee.update({
      where: { id: nominee.id },
      data: { status: command.approved ? "VERIFIED" : "INACTIVE", isCurrent: command.approved },
      select: nomineeSelect,
    });
    await tx.nomineeVerification.create({
      data: {
        nomineeId: nominee.id,
        status: command.approved ? "VERIFIED" : "INACTIVE",
        verifiedById: actorId,
        verifiedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: command.approved ? "NOMINEE_VERIFIED" : "NOMINEE_REJECTED",
        entityType: "Nominee",
        entityId: nominee.id,
        reason: command.reason,
        beforeState: { status: nominee.status, isCurrent: nominee.isCurrent },
        afterState: { status: result.status, isCurrent: result.isCurrent },
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: nominee.member.userId,
      type: "NOMINEE_VERIFICATION",
      title: command.approved ? "Nominee verified" : "Nominee submission needs correction",
      body: command.approved
        ? "The Foundation verified your nominee. The approved nominee is now current."
        : "Your nominee submission was not approved. Any previous verified nominee remains valid. Contact the Foundation for assistance.",
      relatedExternalId: nominee.externalId,
      idempotencyKey: `nominee-reviewed:${nominee.id}`,
    });
    return result;
  });
}

export async function uploadNomineeEvidence(userId: string, externalId: string, file: File) {
  z.string().uuid().parse(externalId);
  const evidence = await readCashEvidence(file);
  return runSerializablePaymentTransaction(async (tx) => {
    const nominee = await tx.nominee.findFirst({
      where: { externalId, member: { userId }, status: "PENDING_VERIFICATION" },
      select: { id: true },
    });
    if (!nominee) throw new Error("Pending nominee not found");
    if ((await tx.nomineeDocument.count({ where: { nomineeId: nominee.id } })) >= 10)
      throw new Error("Nominee document limit reached");
    const document = await tx.nomineeDocument.create({
      data: {
        nomineeId: nominee.id,
        storageKey: randomUUID(),
        evidenceBytes: evidence.bytes,
        contentType: evidence.contentType,
        sizeBytes: evidence.bytes.length,
        originalFilename:
          file.name.replace(/[^a-zA-Z0-9._ -]/g, "-").slice(0, 120) || "nominee-evidence",
      },
      select: { externalId: true, originalFilename: true, contentType: true, sizeBytes: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "NOMINEE_DOCUMENT_UPLOADED",
        entityType: "Nominee",
        entityId: nominee.id,
        afterState: { documentExternalId: document.externalId },
      },
    });
    return document;
  });
}
export async function downloadNomineeEvidence(
  actorId: string,
  externalId: string,
  documentExternalId: string,
  scope: "MEMBER" | "COORDINATOR" | "ADMIN",
) {
  z.string().uuid().parse(externalId);
  z.string().uuid().parse(documentExternalId);
  return runSerializablePaymentTransaction(async (tx) => {
    const document = await tx.nomineeDocument.findFirst({
      where: {
        externalId: documentExternalId,
        nominee: {
          externalId,
          ...(scope === "MEMBER"
            ? { member: { userId: actorId } }
            : scope === "COORDINATOR"
              ? {
                  member: {
                    coordinator: {
                      member: { userId: actorId },
                      status: "ACTIVE",
                      isSuspended: false,
                    },
                  },
                }
              : {}),
        },
      },
    });
    if (!document?.evidenceBytes) throw new Error("Nominee document not found");
    await tx.auditLog.create({
      data: {
        actorId,
        action: "NOMINEE_DOCUMENT_DOWNLOADED",
        entityType: "NomineeDocument",
        entityId: document.id,
      },
    });
    return { bytes: new Uint8Array(document.evidenceBytes), contentType: document.contentType };
  });
}
