import { afterAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptSensitiveRecord } from "../src/server/security/bank-encryption";
import { prisma } from "../src/server/database/prisma";
import {
  approveSupportCase,
  initiateSupportPayment,
  listAdminSupportCases,
  openSupportDispute,
  recordSupportPaymentProviderOutcome,
  resolveSupportDispute,
  retrySupportPayment,
  selectSupportNominee,
  verifySupportDocuments,
} from "../src/server/support/support-payment-service";

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const databaseDescribe = runDatabaseTests ? describe : describe.skip;
let marker = "";
let memberId = "";
let deathCaseId = "";
let nomineeId = "";
let supportCaseId = "";
const paymentExternalIds: string[] = [];

databaseDescribe("Phase 8 Neon Community Support payout workflow", () => {
  it("settles one independently eligible ₹1,00,000 payout with audit, dispute, retry, and ledger safety", async () => {
    marker = crypto.randomUUID();
    vi.stubEnv("BANK_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    const now = new Date();
    const [admin, memberUser] = await Promise.all([
      prisma.user.create({ data: { email: `phase8-admin-${marker}@example.invalid` } }),
      prisma.user.create({ data: { email: `phase8-member-${marker}@example.invalid` } }),
    ]);
    const member = await prisma.member.create({
      data: {
        userId: memberUser.id,
        fullName: "Phase 8 Support Member",
        address: "Integration test record",
        joinedAt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
      },
    });
    memberId = member.id;
    const nominee = await prisma.nominee.create({
      data: {
        memberId: member.id,
        kind: "PRIMARY",
        fullName: "Phase 8 Verified Primary",
        relationship: "Spouse",
        status: "VERIFIED",
        // The service may observe only that this opaque record exists. It is
        // intentionally never returned in the Admin queue DTO.
        bankEncrypted: encryptSensitiveRecord({
          accountHolderName: "Synthetic Primary",
          accountNumber: "123456789012",
          ifsc: "ABCD0123456",
        }),
      },
    });
    nomineeId = nominee.id;
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "NOMINEE_BANK_DETAILS_REVIEWED",
        entityType: "Nominee",
        entityId: nominee.id,
        reason: "Synthetic bank review",
      },
    });
    const deathCase = await prisma.deathCase.create({
      data: {
        memberId: member.id,
        reporterIdentity: "Phase 8 integration reporter",
        placeOfDeath: "Mangaluru",
        dateOfDeath: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        status: "APPROVED",
        eligibilityStatus: "ELIGIBLE",
        eligibilityReason: "PRELIMINARY_ELIGIBLE",
        verifiedNomineeId: nominee.id,
        adminVerifiedAt: now,
        adminVerifiedById: admin.id,
      },
    });
    deathCaseId = deathCase.id;
    await prisma.contributionEvent.create({
      data: {
        deathCaseId: deathCase.id,
        status: "PUBLISHED",
        publishedAt: now,
        approvedAt: now,
        approvedById: admin.id,
        publishedById: admin.id,
        publicDetails: "Integration-only verified death notice",
      },
    });
    const document = await prisma.deathDocument.create({
      data: {
        deathCaseId: deathCase.id,
        storageKey: `phase8-evidence-${marker}`,
        contentType: "application/pdf",
        originalFilename: "phase8-verification.pdf",
        sizeBytes: 100,
      },
    });

    // The case is materialized from verified death data. No Contribution rows
    // are created here: support eligibility is independent of collection.
    const queue = await listAdminSupportCases();
    const supportCase = queue.cases.find(
      (item) => item.deathCase.externalId === deathCase.externalId,
    );
    expect(supportCase).toBeDefined();
    if (!supportCase) throw new Error("Expected materialized Phase 8 support case");
    const persistedCase = await prisma.supportCase.findUniqueOrThrow({
      where: { externalId: supportCase.externalId },
    });
    supportCaseId = persistedCase.id;
    expect(supportCase.amountPaise).toBe(10_000_000);
    expect(
      await prisma.contribution.count({ where: { event: { deathCaseId: deathCase.id } } }),
    ).toBe(0);
    expect(JSON.stringify(supportCase)).not.toContain(`test-bank-${marker}`);

    const documentsVerified = await verifySupportDocuments({
      supportCaseExternalId: supportCase.externalId,
      actorId: admin.id,
      documentExternalIds: [document.externalId],
      reason: "Verified restricted evidence for support payment",
    });
    expect(documentsVerified.readiness.requiredDocumentsComplete).toBe(true);
    await expect(
      selectSupportNominee({
        supportCaseExternalId: supportCase.externalId,
        actorId: admin.id,
        nomineeExternalId: nominee.externalId,
      }),
    ).rejects.toThrow("recheck");
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "NOMINEE_BANK_DETAILS_REVIEWED",
        entityType: "Nominee",
        entityId: nominee.id,
        reason: "Synthetic fresh bank review for this support case",
      },
    });
    const nomineeSelected = await selectSupportNominee({
      supportCaseExternalId: supportCase.externalId,
      actorId: admin.id,
      nomineeExternalId: nominee.externalId,
    });
    expect(nomineeSelected.readiness.nomineeBankVerified).toBe(true);

    const approved = await approveSupportCase({
      supportCaseExternalId: supportCase.externalId,
      actorId: admin.id,
      reason: "All Community Support requirements have been reviewed",
    });
    expect(approved.status).toBe("APPROVED");

    const frozen = await openSupportDispute({
      supportCaseExternalId: supportCase.externalId,
      actorId: admin.id,
      reason: "Nominee identity requires a documented review",
    });
    expect(frozen.status).toBe("FROZEN_DISPUTE");
    await expect(
      initiateSupportPayment({
        supportCaseExternalId: supportCase.externalId,
        actorId: admin.id,
        idempotencyKey: `phase8-frozen-${marker}`,
      }),
    ).rejects.toThrow("Admin approval");
    const resumed = await resolveSupportDispute({
      supportCaseExternalId: supportCase.externalId,
      actorId: admin.id,
      resolution: "RESUME",
      reason: "Nominee review completed and original nominee remains valid",
    });
    expect(resumed.status).toBe("APPROVED");

    const initiationKey = `phase8-initiate-${marker}`;
    const initiated = await initiateSupportPayment({
      supportCaseExternalId: supportCase.externalId,
      actorId: admin.id,
      idempotencyKey: initiationKey,
    });
    expect(initiated).toMatchObject({
      outcome: "MANUAL_SETTLEMENT_REQUIRED",
      replayed: false,
      payment: { amountPaise: 10_000_000, status: "PENDING" },
    });
    paymentExternalIds.push(initiated.payment.externalId);
    const initiationReplay = await initiateSupportPayment({
      supportCaseExternalId: supportCase.externalId,
      actorId: admin.id,
      idempotencyKey: initiationKey,
    });
    expect(initiationReplay).toMatchObject({
      replayed: true,
      payment: { externalId: initiated.payment.externalId, status: "PENDING" },
    });

    const failed = await recordSupportPaymentProviderOutcome({
      supportPaymentExternalId: initiated.payment.externalId,
      actorId: admin.id,
      outcome: "FAILED",
      providerReference: `phase8-failed-${marker}`,
    });
    expect(failed).toMatchObject({
      payment: { status: "FAILED" },
      supportCase: { status: "PAYMENT_FAILED" },
    });
    expect(
      await prisma.foundationLedger.count({
        where: { relatedExternalId: initiated.payment.externalId },
      }),
    ).toBe(0);

    const retry = await retrySupportPayment({
      supportCaseExternalId: supportCase.externalId,
      actorId: admin.id,
      idempotencyKey: `phase8-retry-${marker}`,
    });
    expect(retry).toMatchObject({ replayed: false, payment: { status: "PENDING" } });
    paymentExternalIds.push(retry.payment.externalId);
    const settled = await recordSupportPaymentProviderOutcome({
      supportPaymentExternalId: retry.payment.externalId,
      actorId: admin.id,
      outcome: "SUCCEEDED",
      providerReference: `phase8-settled-${marker}`,
    });
    expect(settled).toMatchObject({
      payment: { status: "SUCCEEDED", amountPaise: 10_000_000 },
      supportCase: { status: "PAID" },
      alreadyRecorded: false,
    });
    const replay = await recordSupportPaymentProviderOutcome({
      supportPaymentExternalId: retry.payment.externalId,
      actorId: admin.id,
      outcome: "SUCCEEDED",
      providerReference: `phase8-settled-${marker}`,
    });
    expect(replay.alreadyRecorded).toBe(true);
    expect(
      await prisma.foundationLedger.count({
        where: {
          relatedExternalId: retry.payment.externalId,
          direction: "DEBIT",
          amountPaise: 10_000_000,
          status: "SUCCEEDED",
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          actorId: admin.id,
          action: {
            in: [
              "SUPPORT_REQUIRED_DOCUMENTS_VERIFIED",
              "SUPPORT_NOMINEE_SELECTED_AND_BANK_VERIFIED",
              "SUPPORT_CASE_APPROVED",
              "SUPPORT_NOMINEE_DISPUTE_OPENED",
              "SUPPORT_NOMINEE_DISPUTE_RESOLVED",
              "SUPPORT_PAYMENT_INITIATED",
              "SUPPORT_PAYMENT_FAILED",
              "SUPPORT_PAYMENT_RETRIED",
              "SUPPORT_PAYMENT_SETTLED",
            ],
          },
        },
      }),
    ).toBeGreaterThanOrEqual(9);
    // Each command deliberately uses its own serializable transaction. The
    // shared Neon pool can add several seconds between those independent
    // production-like requests, so keep this integration limit realistic.
  }, 180_000);
});

afterAll(async () => {
  if (!runDatabaseTests || !marker) return;
  const users = await prisma.user.findMany({
    where: { email: { contains: marker, endsWith: "@example.invalid" } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const supportCases = supportCaseId ? [supportCaseId] : [];
  const deathCases = deathCaseId ? [deathCaseId] : [];
  const nomineeIds = nomineeId ? [nomineeId] : [];

  await prisma.$transaction(
    async (tx) => {
      await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
      await tx.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: userIds } },
            { entityId: { in: [...supportCases, ...paymentExternalIds, ...deathCases] } },
          ],
        },
      });
      if (paymentExternalIds.length)
        await tx.foundationLedger.deleteMany({
          where: { relatedExternalId: { in: paymentExternalIds } },
        });
      if (supportCases.length) {
        await tx.supportDocumentVerification.deleteMany({
          where: { supportCaseId: { in: supportCases } },
        });
        await tx.supportDispute.deleteMany({ where: { supportCaseId: { in: supportCases } } });
        await tx.supportPayment.deleteMany({ where: { supportCaseId: { in: supportCases } } });
        await tx.supportCase.deleteMany({ where: { id: { in: supportCases } } });
      }
      if (deathCases.length) {
        await tx.deathDocument.deleteMany({ where: { deathCaseId: { in: deathCases } } });
        await tx.contributionEvent.deleteMany({ where: { deathCaseId: { in: deathCases } } });
        await tx.deathCase.deleteMany({ where: { id: { in: deathCases } } });
      }
      if (nomineeIds.length) {
        await tx.nomineeVerification.deleteMany({ where: { nomineeId: { in: nomineeIds } } });
        await tx.nomineeDocument.deleteMany({ where: { nomineeId: { in: nomineeIds } } });
        await tx.nominee.deleteMany({ where: { id: { in: nomineeIds } } });
      }
      if (memberId) await tx.member.deleteMany({ where: { id: memberId } });
      if (userIds.length) await tx.user.deleteMany({ where: { id: { in: userIds } } });
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  await prisma.$disconnect();
  vi.unstubAllEnvs();
}, 90_000);
