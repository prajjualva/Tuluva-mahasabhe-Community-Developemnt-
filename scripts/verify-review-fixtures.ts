import assert from "node:assert/strict";
import { prisma } from "../src/server/database/prisma";
import { seedReviewWorkspace } from "../src/server/deployment/review-fixtures";
import {
  payDueFromWallet,
  startPlanWalletFirstSplitPayment,
} from "../src/server/payments/wallet-service";
import {
  officialReceiptHtml,
  officialReceiptShareText,
} from "../src/server/payments/receipt-document";
import { selectContributionDue } from "../src/server/payments/contribution-service";
import { verifyPassword } from "../src/server/auth/password";

let stage = "initial fixture transaction";
async function main() {
  assert.deepEqual(await seedReviewWorkspace(prisma, process.env), {
    sampleMembers: 2,
    sampleEvents: 3,
  });
  stage = "fixture replay protection";
  const originalCount = await prisma.user.count();
  await assert.rejects(seedReviewWorkspace(prisma, process.env), /empty database/);
  assert.equal(await prisma.user.count(), originalCount);
  assert.equal(await prisma.payment.count(), 0);
  assert.equal(await prisma.receipt.count(), 0);
  assert.equal(await prisma.walletCreditCommand.count(), 2);
  assert.equal(
    await prisma.due.count({
      where: { purpose: "CONTRIBUTION", member: { coordinatorProfile: { isNot: null } } },
    }),
    3,
  );
  assert.equal(
    await prisma.auditLog.count({ where: { action: "CONTRIBUTION_DUES_GENERATED" } }),
    3,
  );
  stage = "Member account permissions";
  const members = await prisma.member.findMany({
    where: {
      user: { email: { in: ["tuluworld+playreview@gmail.com", "online@review.example.invalid"] } },
    },
    include: { dues: true, user: { include: { roles: { include: { role: true } } } } },
  });
  assert.equal(members.length, 2);
  for (const member of members) {
    assert.deepEqual(
      member.user.roles.map((grant) => grant.role.code),
      ["MEMBER"],
    );
    assert.ok(await verifyPassword(member.user.passwordHash!, process.env.REVIEW_MEMBER_PASSWORD!));
    assert.equal(member.dues.length, 5);
  }
  const member = members.find((entry) => entry.fullName === "Wallet reviewer")!;
  const annual = member.dues.find((due) => due.purpose === "MEMBERSHIP")!;
  const key = `review-wallet-acceptance:${annual.externalId}`;
  stage = "wallet settlement and receipt";
  const settled = await payDueFromWallet(member.id, annual.id, member.userId, key);
  assert.equal(settled.payment.status, "SUCCEEDED");
  assert.match(settled.receipt!.receiptNumber, /^TEST-RCP-/);
  assert.equal(
    (await payDueFromWallet(member.id, annual.id, member.userId, key)).alreadyProcessed,
    true,
  );
  assert.equal(await prisma.receipt.count(), 1);
  assert.equal(
    await prisma.due.count({ where: { memberId: member.id, purpose: "MEMBERSHIP" } }),
    1,
  );
  assert.equal(
    (await prisma.wallet.findUniqueOrThrow({ where: { memberId: member.id } })).balancePaise,
    163_100,
  );
  const document = {
    ...settled.receipt!,
    amountPaise: settled.payment.amountPaise,
    method: "WALLET",
    status: "SUCCEEDED",
    paymentExternalId: settled.payment.externalId,
    providerReference: null,
    member: { externalId: member.externalId, fullName: member.fullName },
    due: { externalId: annual.externalId, purpose: annual.purpose },
  };
  assert.match(officialReceiptHtml(document), /TEST payment receipt/);
  assert.match(officialReceiptShareText(document), /TEST receipt/);
  stage = "contribution FIFO";
  const contribution = await selectContributionDue({ memberId: member.id });
  assert.equal(contribution.amountPaise, 10_000);
  await payDueFromWallet(
    member.id,
    contribution.id,
    member.userId,
    `review-contribution:${contribution.externalId}`,
  );
  assert.notEqual((await selectContributionDue({ memberId: member.id })).id, contribution.id);
  stage = "plan wallet settlement";
  const planDue = member.dues.find((due) => due.purpose === "PLAN_REGISTRATION")!;
  await payDueFromWallet(member.id, planDue.id, member.userId, `review-plan:${planDue.externalId}`);
  assert.equal(
    (await prisma.communitySupportPlan.findUniqueOrThrow({ where: { id: planDue.planId! } }))
      .status,
    "PENDING_COORDINATOR_APPROVAL",
  );
  stage = "cross-Member denial and pending online split";
  const online = members.find((entry) => entry.fullName === "Online reviewer")!;
  await assert.rejects(
    payDueFromWallet(online.id, annual.id, online.userId, "review-idor-denial-unique"),
    /not payable/,
  );
  const onlinePlan = online.dues.find((due) => due.purpose === "PLAN_REGISTRATION")!;
  const split = await startPlanWalletFirstSplitPayment(
    online.id,
    onlinePlan.id,
    online.userId,
    "review-split-acceptance-unique",
  );
  assert.equal(split.walletPaise, 25_000);
  assert.equal(split.onlinePayment.amountPaise, 75_000);
  assert.equal(split.onlinePayment.status, "PENDING");
  assert.equal(
    (await prisma.due.findUniqueOrThrow({ where: { id: onlinePlan.id } })).status,
    "PENDING",
  );
  assert.equal(
    (await prisma.communitySupportPlan.findUniqueOrThrow({ where: { id: onlinePlan.planId! } }))
      .status,
    "PAYMENT_PENDING",
  );
  assert.equal(await prisma.payment.count({ where: { method: "ONLINE", status: "SUCCEEDED" } }), 0);
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error: unknown) => {
    // Only controlled labels/codes: never print Prisma diagnostics or input values.
    const code = (error as { code?: string })?.code;
    console.error(
      `Review assertion failed at ${stage}${code && /^P\d{4}$/.test(code) ? ` (${code})` : ""}.`,
    );
    process.exitCode = 1;
  });
