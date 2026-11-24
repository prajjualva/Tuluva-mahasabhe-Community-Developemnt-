import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../auth/password";
import { PERMISSIONS } from "../auth/authorization";
import { SCHEME_DEFAULTS } from "../../domain/scheme-settings";
import { addUtcCalendarMonths } from "../../domain/calendar";
import { membershipCycleKey } from "../membership/membership-lifecycle-service";
import { generateContributionDuesInTransaction } from "../contributions/contribution-generation-service";
import { assertReviewEnvironment, isReviewWorkspace } from "./review-environment";

/** Operator-only: never imported by an API route, and never runs on a populated database. */
export async function seedReviewWorkspace(
  database: PrismaClient,
  env: Record<string, string | undefined>,
) {
  if (!isReviewWorkspace(env)) throw new Error("Review fixture setup requires explicit isolation.");
  assertReviewEnvironment(env);
  const input = z
    .object({
      REVIEW_MEMBER_PASSWORD: z.string().min(16).max(30),
      REVIEW_OPERATOR_PASSWORD: z.string().min(32).max(128),
    })
    .parse(env);
  if (input.REVIEW_MEMBER_PASSWORD === input.REVIEW_OPERATOR_PASSWORD)
    throw new Error("Review operator and Member credentials must be distinct.");
  const [memberHash, operatorHash] = await Promise.all([
    hashPassword(input.REVIEW_MEMBER_PASSWORD),
    hashPassword(input.REVIEW_OPERATOR_PASSWORD),
  ]);
  const target = decodeURIComponent(new URL(env.DATABASE_URL!).pathname.slice(1));
  return database.$transaction(
    async (tx) => {
      const actual = await tx.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
      if (actual[0]?.name !== target || (await tx.user.count()) || (await tx.auditLog.count()))
        throw new Error("Review fixtures require the exact newly provisioned empty database.");
      const now = new Date();
      const permissions = await Promise.all(
        PERMISSIONS.map((code) =>
          tx.permission.upsert({
            where: { code },
            create: { code, description: code },
            update: {},
          }),
        ),
      );
      const roles = new Map<string, string>();
      for (const code of ["ADMIN", "MEMBER", "COORDINATOR"]) {
        const role = await tx.role.create({ data: { code, name: code } });
        roles.set(code, role.id);
        await tx.rolePermission.createMany({
          data: permissions
            .filter(
              (permission) =>
                code === "ADMIN" || permission.code.startsWith(`${code.toLowerCase()}:`),
            )
            .map((permission) => ({ roleId: role.id, permissionId: permission.id })),
        });
      }
      for (const [key, value] of Object.entries(SCHEME_DEFAULTS)) {
        await tx.schemeSetting.upsert({
          where: { key },
          create: { key, versions: { create: { value, effectiveFrom: now } } },
          update: { versions: { create: { value, effectiveFrom: now } } },
        });
      }
      const operator = await tx.user.create({
        data: {
          email: "operator@review.example.invalid",
          passwordHash: operatorHash,
          roles: { create: { roleId: roles.get("ADMIN")! } },
        },
      });
      const coordinatorUser = await tx.user.create({
        data: {
          email: "coordinator@review.example.invalid",
          passwordHash: operatorHash,
          roles: {
            create: ["MEMBER", "COORDINATOR"].map((role) => ({ roleId: roles.get(role)! })),
          },
        },
      });
      const coordinatorMember = await tx.member.create({
        data: {
          userId: coordinatorUser.id,
          fullName: "Sample Coordinator",
          address: "Fictional review address",
          joinedAt: now,
        },
      });
      const coordinator = await tx.coordinator.create({
        data: {
          memberId: coordinatorMember.id,
          referralCode: "REVIEWONLY",
        },
      });
      const members = [];
      for (const [index, email, name, creditPaise] of [
        [0, "tuluworld+playreview@gmail.com", "Wallet reviewer", 200_000],
        [1, "online@review.example.invalid", "Online reviewer", 25_000],
      ] as const) {
        const user = await tx.user.create({
          data: {
            email,
            mobile: `+91900000900${index}`,
            passwordHash: memberHash,
            roles: { create: { roleId: roles.get("MEMBER")! } },
          },
        });
        const member = await tx.member.create({
          data: {
            userId: user.id,
            coordinatorId: coordinator.id,
            fullName: name,
            address: "Sample House, Review Street, Fictional City — TEST ONLY",
            status: "GRACE",
            joinedAt: now,
            memberships: {
              create: { status: "GRACE", startedAt: now, periods: { create: { startsAt: now } } },
            },
            referral: { create: { coordinatorId: coordinator.id } },
          },
        });
        await tx.due.create({
          data: {
            memberId: member.id,
            purpose: "MEMBERSHIP",
            amountPaise: SCHEME_DEFAULTS.annualMembershipFeePaise,
            dueAt: addUtcCalendarMonths(now, SCHEME_DEFAULTS.membershipGraceMonths),
            billingCycleKey: membershipCycleKey(member.id, now, 0),
          },
        });
        const plan = await tx.communitySupportPlan.create({
          data: { memberId: member.id, status: "PAYMENT_PENDING" },
        });
        await tx.due.create({
          data: {
            memberId: member.id,
            planId: plan.id,
            purpose: "PLAN_REGISTRATION",
            amountPaise: SCHEME_DEFAULTS.planRegistrationFeePaise,
            dueAt: new Date(now.getTime() + SCHEME_DEFAULTS.planPaymentDueDays * 86_400_000),
          },
        });
        const wallet = await tx.wallet.create({
          data: { memberId: member.id, balancePaise: creditPaise, version: 1 },
        });
        const entry = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            direction: "CREDIT",
            amountPaise: creditPaise,
            balanceAfterPaise: creditPaise,
            purpose: "REVIEW_TEST_CREDIT",
          },
        });
        const command = await tx.walletCreditCommand.create({
          data: {
            memberId: member.id,
            actorId: operator.id,
            amountPaise: creditPaise,
            purpose: "REVIEW_TEST_CREDIT",
            reason: "Non-monetary test allocation in isolated reviewer database",
            idempotencyKey: `review-initial-credit:${member.externalId}`,
            walletTransactionId: entry.id,
          },
        });
        await tx.foundationLedger.create({
          data: {
            direction: "CREDIT",
            amountPaise: creditPaise,
            purpose: "REVIEW_TEST_CREDIT",
            relatedExternalId: command.externalId,
            reference: command.externalId,
            authorizedActorId: operator.id,
            status: "SUCCEEDED",
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: operator.id,
            actorRole: "REVIEW_FIXTURE_OPERATOR",
            action: "REVIEW_TEST_CREDIT_ALLOCATED",
            entityType: "WalletTransaction",
            entityId: entry.id,
            reason: "TEST funds only; no real payment or Foundation entitlement",
            afterState: { amountPaise: creditPaise, memberExternalId: member.externalId },
          },
        });
        await tx.notification.create({
          data: {
            userId: user.id,
            type: "SYSTEM",
            channel: "IN_APP",
            title: "Your reviewer workspace is ready",
            body: "Use the test funds and fictional records to try Member features. No real money or membership entitlement is created.",
            template: "REVIEW_WORKSPACE_READY",
            payload: { testOnly: true },
          },
        });
        members.push(member);
      }
      const news = await tx.communityNews.create({
        data: {
          title: "Welcome to the Community Support Plan",
          audience: "FOUNDATION_WIDE",
          status: "PUBLISHED",
          body: "Members can review their membership, plan and contributions, pay from the Foundation Wallet or online, and download receipts. Plan activation follows payment, Coordinator review, Admin approval and the initial six-month waiting period. These are fictional records in the reviewer test workspace.",
          authorId: operator.id,
          approvedById: operator.id,
          approvedAt: now,
          publishedAt: now,
        },
      });
      await tx.newsComment.create({
        data: {
          newsId: news.id,
          userId: coordinatorUser.id,
          body: "Sample comment: contact your Coordinator for help with your membership.",
        },
      });
      for (let index = 0; index < 3; index++) {
        const deathCase = await tx.deathCase.create({
          data: {
            reporterIdentity: "Sample community notice",
            placeOfDeath: "Fictional City",
            dateOfDeath: now,
            status: "APPROVED",
            eligibilityStatus: "INELIGIBLE",
            eligibilityReason: "Fictional reviewer fixture; no real support payment is payable",
            details: "Sample support event for testing contribution dues only.",
            approvedAt: now,
          },
        });
        const event = await tx.contributionEvent.create({
          data: {
            deathCaseId: deathCase.id,
            status: "APPROVED",
            createdAt: now,
            approvedAt: now,
            approvedById: operator.id,
            publishedById: operator.id,
            publicDetails: `Sample community support event ${index + 1}. Fictional notice for reviewer testing.`,
          },
        });
        await generateContributionDuesInTransaction(tx, {
          eventExternalId: event.externalId,
          actorId: operator.id,
          publishedAt: now,
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: operator.id,
          actorRole: "REVIEW_FIXTURE_OPERATOR",
          action: "REVIEW_WORKSPACE_INITIALIZED",
          entityType: "ReviewWorkspace",
          entityId: operator.id,
          reason: "New isolated review database with fictional records only",
          afterState: { databaseName: target, sampleMembers: members.length, sampleEvents: 3 },
        },
      });
      return { sampleMembers: members.length, sampleEvents: 3 };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 },
  );
}
