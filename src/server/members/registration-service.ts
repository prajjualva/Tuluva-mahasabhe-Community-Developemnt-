import { hashPassword } from "../auth/password";
import { registrationInput, type RegistrationInput } from "./member-service";
import { addUtcCalendarMonths } from "../../domain/calendar";
import { effectiveSchemeNumber } from "../database/scheme-policy";
import { membershipCycleKey } from "../membership/membership-lifecycle-service";
import { createInAppNotificationInTransaction } from "../notifications/notification-service";
import { runSerializablePaymentTransaction } from "../payments/payment-integrity";

/** Creates identity, member, membership history, and first ₹369 due atomically. */
export async function registerMemberPersistently(raw: RegistrationInput) {
  const input = registrationInput.parse(raw);
  const passwordHash = await hashPassword(input.password);
  return runSerializablePaymentTransaction(async (tx) => {
    const coordinator = await tx.coordinator.findFirst({
      where: {
        referralCode: input.referralCode.toUpperCase(),
        isSuspended: false,
        status: "ACTIVE",
        member: { status: { notIn: ["CLOSED", "DECEASED"] } },
      },
      select: { id: true, member: { select: { userId: true, fullName: true } } },
    });
    if (!coordinator) throw new Error("Referral code is invalid or inactive");
    const memberRole = await tx.role.findUnique({
      where: { code: "MEMBER" },
      select: { id: true },
    });
    if (!memberRole) throw new Error("Member role is not configured");
    const user = await tx.user.create({
      data: { email: input.email, mobile: input.mobile, passwordHash },
    });
    const member = await tx.member.create({
      data: {
        userId: user.id,
        coordinatorId: coordinator.id,
        fullName: input.fullName,
        address: input.address,
        status: "GRACE",
      },
    });
    await tx.referral.create({ data: { coordinatorId: coordinator.id, memberId: member.id } });
    await tx.coordinatorTransfer.create({
      data: {
        memberId: member.id,
        toCoordinatorId: coordinator.id,
        actorId: user.id,
        reason: "Initial referral registration",
      },
    });
    const membership = await tx.membership.create({
      data: { memberId: member.id, status: "GRACE" },
    });
    await tx.membershipPeriod.create({
      data: { membershipId: membership.id, startsAt: new Date() },
    });
    const due = await tx.due.create({
      data: {
        memberId: member.id,
        purpose: "MEMBERSHIP",
        amountPaise: await effectiveSchemeNumber(tx, "annualMembershipFeePaise"),
        dueAt: addUtcCalendarMonths(
          member.joinedAt,
          await effectiveSchemeNumber(tx, "membershipGraceMonths"),
        ),
        billingCycleKey: membershipCycleKey(member.id, member.joinedAt, 0),
      },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: memberRole.id } });
    await tx.auditLog.create({
      data: {
        actorRole: "SYSTEM",
        action: "MEMBER_REGISTERED",
        entityType: "Member",
        entityId: member.id,
        afterState: {
          memberExternalId: member.externalId,
          membershipDueExternalId: due.externalId,
        },
      },
    });
    await createInAppNotificationInTransaction(tx, {
      userId: user.id,
      type: "REGISTRATION",
      title: "Welcome to Community Support Foundation",
      body: "Your member account has been created. Your membership payment is available in the member portal.",
      template: "MEMBER_REGISTERED",
      relatedExternalId: member.externalId,
      payload: { memberExternalId: member.externalId, membershipDueExternalId: due.externalId },
      idempotencyKey: `member-registration:${member.id}`,
    });
    await createInAppNotificationInTransaction(tx, {
      userId: user.id,
      type: "COORDINATOR_ASSIGNED",
      title: "Coordinator assigned",
      body: `${coordinator.member.fullName} is assigned as your referring Coordinator. Their details are available in your member portal.`,
      relatedExternalId: member.externalId,
      idempotencyKey: `initial-coordinator:${member.id}`,
    });
    await createInAppNotificationInTransaction(tx, {
      userId: coordinator.member.userId,
      type: "COORDINATOR_ASSIGNED",
      title: "New member assigned",
      body: `A new member (${member.externalId}) registered using your referral code.`,
      relatedExternalId: member.externalId,
      idempotencyKey: `referral-member:${member.id}`,
    });
    await createInAppNotificationInTransaction(tx, {
      userId: user.id,
      type: "EMAIL_VERIFICATION",
      title: "Verify your email address",
      body: "Please verify your email address when prompted to keep your member account up to date.",
      template: "EMAIL_VERIFICATION_REQUIRED",
      relatedExternalId: member.externalId,
      idempotencyKey: `member-email-verification:${member.id}`,
    });
    await createInAppNotificationInTransaction(tx, {
      userId: user.id,
      type: "MOBILE_VERIFICATION",
      title: "Verify your mobile number",
      body: "Please verify your mobile number when prompted to keep your member account up to date.",
      template: "MOBILE_VERIFICATION_REQUIRED",
      relatedExternalId: member.externalId,
      idempotencyKey: `member-mobile-verification:${member.id}`,
    });
    return {
      memberExternalId: member.externalId,
      membershipDueExternalId: due.externalId,
      membershipDueAt: due.dueAt,
    };
  });
}
