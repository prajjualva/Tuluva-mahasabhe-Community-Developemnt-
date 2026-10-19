import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/prisma";
import { runSerializablePaymentTransaction } from "./payment-integrity";
import { readCashEvidence } from "../coordinators/cash-evidence";
import { officialReceiptHtml } from "./receipt-document";

const adjustmentSelect = {
  externalId: true,
  amountPaise: true,
  purpose: true,
  reference: true,
  reason: true,
  status: true,
  createdAt: true,
  decidedAt: true,
  decisionReason: true,
} satisfies Prisma.LedgerAdjustmentSelect;
const adjustmentSchema = z
  .object({
    amountPaise: z.number().int().positive().max(2_147_483_647),
    purpose: z.string().trim().min(3).max(200),
    reference: z.string().trim().min(3).max(120),
    reason: z.string().trim().min(3).max(1000),
    idempotencyKey: z.string().min(16).max(200),
  })
  .strict();

export async function listFoundationLedger(query: {
  page?: number;
  purpose?: string;
  direction?: "CREDIT" | "DEBIT";
}) {
  const page = z
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(query.page ?? 1);
  const where: Prisma.FoundationLedgerWhereInput = {
    ...(query.purpose ? { purpose: { contains: query.purpose, mode: "insensitive" } } : {}),
    ...(query.direction ? { direction: query.direction } : {}),
  };
  const [entries, total, totals, adjustments] = await Promise.all([
    prisma.foundationLedger.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { externalId: "desc" }],
      skip: (page - 1) * 50,
      take: 50,
      select: {
        externalId: true,
        amountPaise: true,
        purpose: true,
        relatedExternalId: true,
        authorizedActorId: true,
        createdAt: true,
        reference: true,
        status: true,
        direction: true,
      },
    }),
    prisma.foundationLedger.count({ where }),
    prisma.foundationLedger.groupBy({
      by: ["direction"],
      where: { status: "SUCCEEDED" },
      _sum: { amountPaise: true },
    }),
    prisma.ledgerAdjustment.findMany({
      select: adjustmentSelect,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const actors = await prisma.user.findMany({
    where: {
      id: {
        in: entries.flatMap((item) => (item.authorizedActorId ? [item.authorizedActorId] : [])),
      },
    },
    select: { id: true, externalId: true, member: { select: { fullName: true } } },
  });
  return {
    page,
    total,
    totals: totals.map((item) => ({
      direction: item.direction,
      amountPaise: item._sum.amountPaise ?? 0,
    })),
    entries: entries.map(({ authorizedActorId, ...item }) => ({
      ...item,
      reference: item.reference ?? item.relatedExternalId ?? item.externalId,
      actor: authorizedActorId
        ? (() => {
            const actor = actors.find((user) => user.id === authorizedActorId);
            return actor
              ? {
                  externalId: actor.externalId,
                  name: actor.member?.fullName ?? "Foundation operator",
                }
              : null;
          })()
        : null,
      supportingDocumentUrl: `/api/admin/ledger/${item.externalId}/document`,
    })),
    adjustments,
  };
}

export async function requestOperationalAdjustment(actorId: string, input: unknown, file: File) {
  const command = adjustmentSchema.parse(input);
  const evidence = await readCashEvidence(file);
  const commandHash = createHash("sha256")
    .update(JSON.stringify({ ...command, digest: evidence.digest }))
    .digest("hex");
  return runSerializablePaymentTransaction(async (tx) => {
    const existing = await tx.ledgerAdjustment.findUnique({
      where: { idempotencyKey: command.idempotencyKey },
    });
    if (existing) {
      if (existing.requestedBy !== actorId || existing.commandHash !== commandHash)
        throw new Error("Idempotency key is already in use");
      return tx.ledgerAdjustment.findUniqueOrThrow({
        where: { id: existing.id },
        select: adjustmentSelect,
      });
    }
    const adjustment = await tx.ledgerAdjustment.create({
      data: {
        ...command,
        requestedBy: actorId,
        commandHash,
        evidenceBytes: evidence.bytes,
        contentType: evidence.contentType,
      },
      select: adjustmentSelect,
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "LEDGER_ADJUSTMENT_REQUESTED",
        entityType: "LedgerAdjustment",
        entityId: adjustment.externalId,
        reason: command.reason,
        afterState: { amountPaise: command.amountPaise, reference: command.reference },
      },
    });
    return adjustment;
  });
}

export async function decideOperationalAdjustment(
  actorId: string,
  externalId: string,
  input: unknown,
) {
  z.string().uuid().parse(externalId);
  const decision = z
    .object({ approved: z.boolean(), reason: z.string().trim().min(3).max(1000) })
    .strict()
    .parse(input);
  return runSerializablePaymentTransaction(async (tx) => {
    const adjustment = await tx.ledgerAdjustment.findUnique({ where: { externalId } });
    if (!adjustment) throw new Error("Adjustment not found");
    const status = decision.approved ? "APPROVED" : "REJECTED";
    if (adjustment.status !== "PENDING") {
      if (adjustment.status !== status || adjustment.decisionReason !== decision.reason)
        throw new Error("Adjustment has already been reviewed");
      return tx.ledgerAdjustment.findUniqueOrThrow({
        where: { externalId },
        select: adjustmentSelect,
      });
    }
    if (decision.approved)
      await tx.foundationLedger.create({
        data: {
          direction: "DEBIT",
          amountPaise: adjustment.amountPaise,
          purpose: `OPERATIONAL_ADJUSTMENT: ${adjustment.purpose}`,
          relatedExternalId: adjustment.externalId,
          reference: adjustment.reference,
          authorizedActorId: actorId,
          status: "SUCCEEDED",
        },
      });
    await tx.ledgerAdjustment.update({
      where: { id: adjustment.id },
      data: {
        status,
        approvedBy: actorId,
        decisionReason: decision.reason,
        decidedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: `LEDGER_ADJUSTMENT_${status}`,
        entityType: "LedgerAdjustment",
        entityId: adjustment.externalId,
        reason: decision.reason,
        beforeState: { status: "PENDING" },
        afterState: { status, amountPaise: adjustment.amountPaise },
      },
    });
    return tx.ledgerAdjustment.findUniqueOrThrow({
      where: { externalId },
      select: adjustmentSelect,
    });
  });
}

export async function downloadLedgerDocument(
  actorId: string,
  externalId: string,
  adjustmentOnly = false,
) {
  z.string().uuid().parse(externalId);
  return runSerializablePaymentTransaction(async (tx) => {
    if (adjustmentOnly) {
      const adjustment = await tx.ledgerAdjustment.findUnique({ where: { externalId } });
      if (!adjustment) throw new Error("Adjustment not found");
      await tx.auditLog.create({
        data: {
          actorId,
          action: "LEDGER_DOCUMENT_DOWNLOADED",
          entityType: "LedgerAdjustment",
          entityId: adjustment.id,
        },
      });
      return {
        bytes: new Uint8Array(adjustment.evidenceBytes),
        contentType: adjustment.contentType,
      };
    }
    const entry = await tx.foundationLedger.findUnique({
      where: { externalId },
      include: { supportingDeposit: true },
    });
    if (!entry) throw new Error("Ledger entry not found");
    await tx.auditLog.create({
      data: {
        actorId,
        action: "LEDGER_DOCUMENT_DOWNLOADED",
        entityType: "FoundationLedger",
        entityId: entry.id,
      },
    });
    if (entry.supportingDeposit?.evidenceBytes)
      return {
        bytes: new Uint8Array(entry.supportingDeposit.evidenceBytes),
        contentType: entry.supportingDeposit.contentType!,
      };
    if (entry.purpose.startsWith("OPERATIONAL_ADJUSTMENT:") && entry.relatedExternalId) {
      const adjustment = await tx.ledgerAdjustment.findUniqueOrThrow({
        where: { externalId: entry.relatedExternalId },
      });
      return {
        bytes: new Uint8Array(adjustment.evidenceBytes),
        contentType: adjustment.contentType,
      };
    }
    // Automated ledger movements have a printable electronic accounting voucher.
    // Never serialize underlying bank data, provider credentials or internal notes.
    const html = officialReceiptHtml({
      receiptNumber: `LEDGER-${entry.externalId}`,
      issuedAt: entry.createdAt,
      amountPaise: entry.amountPaise,
      method: `${entry.direction} · ${entry.purpose}`,
      status: entry.status,
      providerReference: entry.reference,
      paymentExternalId: entry.relatedExternalId ?? entry.externalId,
      member: null,
      due: null,
    })
      .replaceAll("Official payment receipt", "Foundation accounting voucher")
      .replaceAll(
        "This document records a successful Foundation payment.",
        "This document records a settled Foundation Ledger movement.",
      );
    return { bytes: new Uint8Array(Buffer.from(html)), contentType: "text/html; charset=utf-8" };
  });
}
