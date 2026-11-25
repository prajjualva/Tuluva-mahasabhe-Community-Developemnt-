import type { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { addUtcCalendarMonths } from "../../domain/calendar";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";
import { isReviewWorkspace } from "../deployment/review-environment";

type Source = {
  memberId: string;
  userId: string;
  fullName: string;
  address: string;
  mobile: string | null;
  photoBytes: Uint8Array | null;
  joinedAt: Date;
  membershipBillingAnchor: Date | null;
  issuedAt: Date;
  reference: string;
};
async function issuePack(
  tx: Prisma.TransactionClient,
  source: Source,
  paymentId: string | null,
  grantId: string | null,
) {
  const replay = await tx.membershipPack.findUnique({
    where: paymentId ? { paymentId } : { grantId: grantId! },
  });
  if (replay) return replay;
  const pack = await tx.membershipPack.create({
    data: {
      memberId: source.memberId,
      paymentId,
      grantId,
      fullName: source.fullName,
      address: source.address,
      mobile: source.mobile,
      photoBytes: source.photoBytes ? new Uint8Array(source.photoBytes) : null,
      issuedAt: source.issuedAt,
      // An initial registration payment/exemption covers its original billing cycle.
      validUntil: addUtcCalendarMonths(source.membershipBillingAnchor ?? source.joinedAt, 12),
      testOnly: isReviewWorkspace(),
      certificateNumber: `${isReviewWorkspace() ? "TEST-" : ""}TM-MEM-${source.reference.replaceAll("-", "").toUpperCase()}`,
    },
  });
  await tx.auditLog.create({
    data: {
      actorRole: "SYSTEM",
      action: "MEMBERSHIP_PACK_ISSUED",
      entityType: "MembershipPack",
      entityId: pack.id,
      afterState: {
        externalId: pack.externalId,
        sourceExternalId: source.reference,
        certificateNumber: pack.certificateNumber,
        basis: grantId ? "ADMIN_FEE_EXEMPTION" : "VERIFIED_PAYMENT",
      },
    },
  });
  await createInAppNotificationInTransaction(tx, {
    userId: source.userId,
    type: grantId ? "MEMBERSHIP_GRANTED" : "MEMBERSHIP_ACTIVATED",
    title: "Welcome to Tuluva Mahasabhe",
    body: grantId
      ? "Foundation Admin granted your initial membership with a fee exemption. Your ID card, certificate and exemption record are ready. No payment was collected."
      : "Your initial membership payment is verified. Your ID card, membership certificate and receipt are ready. Verify your email to receive your membership pack.",
    relatedExternalId: pack.externalId,
    idempotencyKey: `membership-pack:${paymentId ?? grantId}`,
  });
  return pack;
}

/** One parameterized join avoids multi-query relation loading inside a financial transaction. */
export async function issueMembershipPackInTransaction(
  tx: Prisma.TransactionClient,
  paymentId: string,
) {
  const [source] = await tx.$queryRaw<Source[]>`
    SELECT m.id AS "memberId", m."userId", m."fullName", m.address, u.mobile,
      f.bytes AS "photoBytes", m."joinedAt", m."membershipBillingAnchor",
      r."issuedAt" AS "issuedAt", p."externalId" AS reference
    FROM payments p JOIN members m ON m.id=p."memberId"
    JOIN dues d ON d.id=p."dueId" AND d.id=m."registrationDueId" AND d."memberId"=m.id
    JOIN receipts r ON r."paymentId"=p.id JOIN users u ON u.id=m."userId"
    LEFT JOIN member_profile_photos f ON f."memberId"=m.id
    WHERE p.id=${paymentId}::uuid AND p.status='SUCCEEDED' AND d.status='PAID' AND d.purpose='MEMBERSHIP'
      AND m.status NOT IN ('CLOSED','DECEASED')
      AND NOT EXISTS(SELECT 1 FROM payment_refunds rf WHERE rf."paymentId"=p.id AND rf.status='SUCCEEDED')`;
  return source ? issuePack(tx, source, paymentId, null) : null;
}

export async function issueGrantedMembershipPackInTransaction(
  tx: Prisma.TransactionClient,
  grantId: string,
) {
  const [source] = await tx.$queryRaw<Source[]>`
    SELECT m.id AS "memberId", m."userId", m."fullName", m.address, u.mobile,
      f.bytes AS "photoBytes", m."joinedAt", m."membershipBillingAnchor", g."approvedAt" AS "issuedAt", g."externalId" AS reference
    FROM membership_grants g JOIN members m ON m.id=g."memberId" JOIN users u ON u.id=m."userId"
    LEFT JOIN member_profile_photos f ON f."memberId"=m.id WHERE g.id=${grantId}::uuid`;
  if (!source) throw new Error("Membership grant unavailable");
  return issuePack(tx, source, null, grantId);
}

export async function readOwnMembershipPack(userId: string, externalId?: string) {
  return prisma.membershipPack.findFirst({
    where: {
      externalId,
      member: { userId },
      OR: [
        {
          payment: {
            status: "SUCCEEDED",
            OR: [{ refund: { is: null } }, { refund: { status: { not: "SUCCEEDED" } } }],
          },
        },
        { grant: { isNot: null } },
      ],
    },
    include: {
      member: { select: { externalId: true } },
      payment: { select: { externalId: true, amountPaise: true, method: true, receipt: true } },
      grant: { select: { externalId: true } },
    },
    orderBy: { issuedAt: "desc" },
  });
}
