import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import { downloadAdministrativeReceipt } from "../src/server/admin/admin-receipt-service";
import {
  collectCashForDue,
  verifyCashCollection,
} from "../src/server/coordinators/cash-payment-service";
import {
  listCashReconciliation,
  readCashDepositEvidence,
  submitCashDeposit,
  verifyCashDeposit,
} from "../src/server/coordinators/cash-reconciliation-service";
import { escalateCashDiscrepancy } from "../src/server/coordinators/cash-discrepancy-job";
import {
  requestOperationalAdjustment,
  decideOperationalAdjustment,
  downloadLedgerDocument,
} from "../src/server/payments/foundation-ledger-service";

const run = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const userIds: string[] = [];
const memberIds: string[] = [];
const coordinatorIds: string[] = [];
const evidence = () =>
  new File(["%PDF-1.4\nPhase 10 synthetic test evidence\n%%EOF"], "test.pdf", {
    type: "application/pdf",
  });

(run ? describe : describe.skip)("Phase 10 persistent cash reconciliation", () => {
  it("reconciles a combined deposit, preserves shortfalls, prevents duplicates/IDOR, suspends overdue collection and permits recovery", async () => {
    const marker = crypto.randomUUID();
    const users = [];
    for (const kind of ["admin", "coordinator", "outsider", "payer"]) {
      const user = await prisma.user.create({
        data: { email: `phase10-${kind}-${marker}@example.invalid` },
      });
      users.push(user);
      userIds.push(user.id);
    }
    const [admin, owner, outsider, payer] = users;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
    const members = [];
    for (const user of [owner, outsider, payer]) {
      const member = await prisma.member.create({
        data: {
          userId: user.id,
          fullName: "Phase 10 synthetic test",
          address: "Test only",
          status: "ACTIVE",
        },
      });
      members.push(member);
      memberIds.push(member.id);
    }
    const [ownerMember, outsiderMember, payerMember] = members;
    for (const member of [ownerMember, outsiderMember]) {
      const coordinator = await prisma.coordinator.create({
        data: { memberId: member.id, referralCode: `P10-${member.externalId}` },
      });
      coordinatorIds.push(coordinator.id);
    }
    await prisma.member.update({
      where: { id: payerMember.id },
      data: { coordinatorId: coordinatorIds[0] },
    });
    const dues = [];
    for (const amountPaise of [10000, 36900, 10000])
      dues.push(
        await prisma.due.create({
          data: {
            memberId: payerMember.id,
            purpose: amountPaise === 36900 ? "MEMBERSHIP" : "CONTRIBUTION",
            amountPaise,
            dueAt: new Date(Date.now() + 86400000),
          },
        }),
      );
    const payments = [];
    for (const due of dues)
      payments.push(
        await collectCashForDue({
          coordinatorUserId: owner.id,
          memberExternalId: payerMember.externalId,
          dueExternalId: due.externalId,
          idempotencyKey: `phase10-${due.externalId}`,
        }),
      );
    const collections = await prisma.cashCollection.findMany({
      where: { paymentId: { in: payments.map((item) => item.id) } },
      orderBy: { createdAt: "asc" },
    });
    expect(collections[0].status).toBe("RECEIVED_BY_COORDINATOR");
    const receipt = await prisma.receipt.findUniqueOrThrow({
      where: { paymentId: payments[0].id },
    });
    expect(receipt.receiptNumber).toMatch(/^CASH-\d{4}-\d{6,}$/);
    await expect(downloadAdministrativeReceipt(owner.id, receipt.receiptNumber)).rejects.toThrow(
      "Forbidden",
    );
    const pendingReceipt = await downloadAdministrativeReceipt(admin.id, receipt.receiptNumber);
    expect(pendingReceipt.html).toContain("PENDING");
    expect(pendingReceipt.html).not.toContain(payments[0].id);
    expect(
      await prisma.auditLog.count({
        where: { actorId: admin.id, action: "ADMIN_RECEIPT_DOWNLOADED", entityId: payments[0].id },
      }),
    ).toBe(1);
    await expect(verifyCashCollection(collections[0].externalId, admin.id, true)).rejects.toThrow(
      "remittance evidence",
    );
    const input = {
      collectionExternalIds: collections.slice(0, 2).map((item) => item.externalId),
      amountPaise: 10000,
      bankReference: `PHASE10-${marker}`,
      idempotencyKey: `deposit-${marker}`,
    };
    await expect(submitCashDeposit(outsider.id, input, evidence())).rejects.toThrow("unavailable");
    const deposit = await submitCashDeposit(owner.id, input, evidence());
    expect((await submitCashDeposit(owner.id, input, evidence())).externalId).toBe(
      deposit.externalId,
    );
    await expect(
      submitCashDeposit(owner.id, { ...input, amountPaise: 9999 }, evidence()),
    ).rejects.toThrow("Idempotency");
    await expect(readCashDepositEvidence(outsider.id, deposit.externalId, false)).rejects.toThrow(
      "not found",
    );
    expect((await readCashDepositEvidence(owner.id, deposit.externalId, false)).contentType).toBe(
      "application/pdf",
    );
    const decision = {
      approved: true,
      reason: "Synthetic bank confirmation; second collection missing",
      allocations: collections.slice(0, 2).map((item, index) => ({
        collectionExternalId: item.externalId,
        receivedAmountPaise: index ? 0 : 10000,
      })),
    };
    await Promise.all([
      verifyCashDeposit(admin.id, deposit.externalId, decision),
      verifyCashDeposit(admin.id, deposit.externalId, decision),
    ]);
    expect(
      await prisma.foundationLedger.count({
        where: { supportingDeposit: { externalId: deposit.externalId } },
      }),
    ).toBe(1);
    expect((await prisma.due.findUniqueOrThrow({ where: { id: dues[0].id } })).status).toBe("PAID");
    expect((await prisma.due.findUniqueOrThrow({ where: { id: dues[1].id } })).status).toBe(
      "PENDING",
    );
    expect(
      (await prisma.receipt.findUniqueOrThrow({ where: { paymentId: payments[0].id } }))
        .receiptNumber,
    ).toBe(receipt.receiptNumber);
    const discrepancy = await prisma.cashDiscrepancy.findUniqueOrThrow({
      where: { cashCollectionId: collections[1].id },
    });
    expect(discrepancy.amountPaise).toBe(36900);
    await expect(
      verifyCashCollection(
        collections[1].externalId,
        admin.id,
        false,
        "Attempted rejection of outstanding cash",
      ),
    ).rejects.toThrow("must be reconciled");
    expect(
      discrepancy.deadlineAt.getTime() - discrepancy.createdAt.getTime(),
    ).toBeGreaterThanOrEqual(30 * 86400000 - 1000);
    expect(await escalateCashDiscrepancy(discrepancy.id)).toBe(0);
    await expect(
      collectCashForDue({
        coordinatorUserId: owner.id,
        memberExternalId: payerMember.externalId,
        dueExternalId: dues[1].externalId,
        idempotencyKey: `blocked-${marker}`,
      }),
    ).rejects.toThrow("outstanding cash discrepancies");
    // Only this synthetic discrepancy is advanced; never advance the global production job clock.
    expect(
      await escalateCashDiscrepancy(discrepancy.id, new Date(discrepancy.deadlineAt.getTime() + 1)),
    ).toBe(1);
    expect(
      await escalateCashDiscrepancy(discrepancy.id, new Date(discrepancy.deadlineAt.getTime() + 1)),
    ).toBe(0);
    expect(
      (await prisma.coordinator.findUniqueOrThrow({ where: { id: coordinatorIds[0] } }))
        .isSuspended,
    ).toBe(true);
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: payerMember.id } })).coordinatorId,
    ).toBe(null);
    expect(
      await prisma.cashDiscrepancy.count({ where: { cashCollectionId: collections[2].id } }),
    ).toBe(1);
    const recovery = await submitCashDeposit(
      owner.id,
      {
        ...input,
        collectionExternalIds: [collections[1].externalId],
        amountPaise: 36900,
        bankReference: `RECOVERY-${marker}`,
        idempotencyKey: `recovery-${marker}`,
      },
      evidence(),
    );
    await verifyCashDeposit(admin.id, recovery.externalId, {
      approved: true,
      reason: "Synthetic recovery verified",
      allocations: [
        { collectionExternalId: collections[1].externalId, receivedAmountPaise: 36900 },
      ],
    });
    expect(
      (await prisma.cashDiscrepancy.findUniqueOrThrow({ where: { id: discrepancy.id } })).status,
    ).toBe("PAID");
    expect((await prisma.due.findUniqueOrThrow({ where: { id: dues[1].id } })).status).toBe("PAID");
    expect(
      (await prisma.coordinator.findUniqueOrThrow({ where: { id: coordinatorIds[0] } }))
        .isSuspended,
    ).toBe(true);
    expect(JSON.stringify(await listCashReconciliation(owner.id))).not.toContain(payer.email);
    expect((await listCashReconciliation(outsider.id)).collections).toHaveLength(0);
    // A verified remittance must not disappear when death/waiver occurred
    // while the collector still held cash. Record funds, not an entitlement.
    await prisma.due.update({ where: { id: dues[2].id }, data: { status: "WAIVED" } });
    const unapplied = await submitCashDeposit(
      owner.id,
      {
        collectionExternalIds: [collections[2].externalId],
        amountPaise: 10000,
        bankReference: `UNAPPLIED-${marker}`,
        idempotencyKey: `unapplied-cash-${marker}`,
      },
      evidence(),
    );
    await verifyCashDeposit(admin.id, unapplied.externalId, {
      approved: true,
      reason: "Synthetic verified remittance received after waiver",
      allocations: [
        { collectionExternalId: collections[2].externalId, receivedAmountPaise: 10000 },
      ],
    });
    expect((await prisma.due.findUniqueOrThrow({ where: { id: dues[2].id } })).status).toBe(
      "WAIVED",
    );
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payments[2].id } })).status).toBe(
      "SUCCEEDED",
    );
    expect(
      await prisma.foundationLedger.count({
        where: { relatedExternalId: payments[2].externalId, purpose: "UNAPPLIED_PAYMENT" },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityId: payments[2].id, action: "UNAPPLIED_PAYMENT_REQUIRES_REFUND_REVIEW" },
      }),
    ).toBe(1);
    const adjustmentInput = {
      amountPaise: 15000,
      purpose: "Synthetic test operations",
      reference: `ADJ-${marker}`,
      reason: "Synthetic documented adjustment",
      idempotencyKey: `adjustment-${marker}`,
    };
    const adjustment = await requestOperationalAdjustment(admin.id, adjustmentInput, evidence());
    expect(
      (await requestOperationalAdjustment(admin.id, adjustmentInput, evidence())).externalId,
    ).toBe(adjustment.externalId);
    expect(
      await prisma.foundationLedger.count({ where: { relatedExternalId: adjustment.externalId } }),
    ).toBe(0);
    const approval = { approved: true, reason: "Synthetic approval with evidence" };
    await Promise.all([
      decideOperationalAdjustment(admin.id, adjustment.externalId, approval),
      decideOperationalAdjustment(admin.id, adjustment.externalId, approval),
    ]);
    expect(
      await prisma.foundationLedger.count({
        where: { relatedExternalId: adjustment.externalId, direction: "DEBIT" },
      }),
    ).toBe(1);
    expect((await downloadLedgerDocument(admin.id, adjustment.externalId, true)).contentType).toBe(
      "application/pdf",
    );
    await expect(
      decideOperationalAdjustment(admin.id, adjustment.externalId, {
        approved: false,
        reason: "Conflicting reversal",
      }),
    ).rejects.toThrow("already been reviewed");
  }, 240_000);
});

afterAll(async () => {
  if (!run || !userIds.length) return;
  // Delete only synthetic records created by this test, in referential order.
  const collections = await prisma.cashCollection.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    select: { id: true },
  });
  const discrepancyIds = (
    await prisma.cashDiscrepancy.findMany({
      where: { cashCollectionId: { in: collections.map((item) => item.id) } },
      select: { id: true },
    })
  ).map((item) => item.id);
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorId: { in: userIds } },
        { entityId: { in: [...discrepancyIds, ...coordinatorIds] } },
      ],
    },
  });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  const testPayments = await prisma.payment.findMany({
    where: { memberId: { in: memberIds } },
    select: { externalId: true },
  });
  await prisma.notification.deleteMany({
    where: { relatedExternalId: { in: testPayments.map((payment) => payment.externalId) } },
  });
  const adjustmentIds = (
    await prisma.ledgerAdjustment.findMany({
      where: { requestedBy: { in: userIds } },
      select: { externalId: true },
    })
  ).map((item) => item.externalId);
  await prisma.foundationLedger.deleteMany({ where: { relatedExternalId: { in: adjustmentIds } } });
  await prisma.ledgerAdjustment.deleteMany({ where: { requestedBy: { in: userIds } } });
  await prisma.foundationLedger.deleteMany({
    where: { supportingDeposit: { coordinatorId: { in: coordinatorIds } } },
  });
  await prisma.cashDepositAllocation.deleteMany({
    where: { deposit: { coordinatorId: { in: coordinatorIds } } },
  });
  await prisma.cashDeposit.deleteMany({ where: { coordinatorId: { in: coordinatorIds } } });
  await prisma.cashDiscrepancy.deleteMany({
    where: { cashCollectionId: { in: collections.map((item) => item.id) } },
  });
  await prisma.cashCollection.deleteMany({ where: { coordinatorId: { in: coordinatorIds } } });
  await prisma.receipt.deleteMany({ where: { payment: { memberId: { in: memberIds } } } });
  await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.due.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.coordinatorLifecycleEvent.deleteMany({
    where: { coordinatorId: { in: coordinatorIds } },
  });
  await prisma.coordinatorTransfer.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.member.updateMany({
    where: { id: { in: memberIds } },
    data: { coordinatorId: null },
  });
  await prisma.coordinator.deleteMany({ where: { id: { in: coordinatorIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}, 90_000);
