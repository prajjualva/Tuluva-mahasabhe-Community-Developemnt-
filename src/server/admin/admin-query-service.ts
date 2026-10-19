import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/prisma";

export async function adminDashboardSnapshot() {
  const [
    members,
    coordinators,
    plans,
    nominees,
    deathReports,
    events,
    contributions,
    failedPayments,
    cashCollections,
    discrepancies,
    supportPayments,
    wallet,
    ledger,
    auditActivity,
    news,
  ] = await Promise.all([
    prisma.member.groupBy({ by: ["status"], _count: true }),
    prisma.coordinator.groupBy({ by: ["status"], _count: true }),
    prisma.communitySupportPlan.count({ where: { status: "PENDING_ADMIN_APPROVAL" } }),
    prisma.nominee.count({ where: { status: "PENDING_VERIFICATION" } }),
    prisma.deathCase.count({
      where: { status: { in: ["REPORTED", "COORDINATOR_CONFIRMED", "ADMIN_VERIFICATION"] } },
    }),
    prisma.contributionEvent.count({ where: { status: { in: ["APPROVED", "PUBLISHED"] } } }),
    prisma.due.count({
      where: { purpose: "CONTRIBUTION", status: { in: ["PENDING", "OVERDUE", "EXPIRED"] } },
    }),
    prisma.payment.count({ where: { status: "FAILED" } }),
    prisma.cashCollection.count({
      where: { status: { in: ["RECEIVED_BY_COORDINATOR", "PENDING_ADMIN_VERIFICATION"] } },
    }),
    prisma.cashDiscrepancy.count({ where: { status: "UNRESOLVED" } }),
    prisma.supportCase.count({ where: { status: { notIn: ["PAID", "REJECTED"] } } }),
    prisma.walletTransaction.count(),
    prisma.foundationLedger.count(),
    prisma.auditLog.count(),
    prisma.communityNews.count({ where: { status: "PENDING_APPROVAL" } }),
  ]);
  return {
    generatedAt: new Date(),
    totalMembers: members.reduce((sum, row) => sum + row._count, 0),
    members: Object.fromEntries(members.map((row) => [row.status, row._count])),
    coordinators: Object.fromEntries(coordinators.map((row) => [row.status, row._count])),
    tasks: {
      planApprovals: plans,
      nomineeVerification: nominees,
      deathReports,
      deathSupportEvents: events,
      pendingContributions: contributions,
      failedPayments,
      cashVerification: cashCollections,
      discrepancies,
      supportPayments,
      walletActivity: wallet,
      ledgerEntries: ledger,
      auditActivity,
      newsApprovals: news,
    },
  };
}

export async function searchAdminMembers(input: unknown) {
  const query = z
    .object({
      search: z.string().trim().max(160).default(""),
      page: z.coerce.number().int().min(1).max(100000).default(1),
      status: z.enum(["ACTIVE", "GRACE", "INACTIVE", "CLOSED", "DECEASED"]).optional(),
    })
    .strict()
    .parse(input);
  const where: Prisma.MemberWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: "insensitive" } },
            { user: { email: { contains: query.search, mode: "insensitive" } } },
            { user: { mobile: { contains: query.search } } },
            ...(z.string().uuid().safeParse(query.search).success
              ? [{ externalId: query.search }]
              : []),
          ],
        }
      : {}),
  };
  const [total, members] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      take: 30,
      skip: (query.page - 1) * 30,
      orderBy: [{ joinedAt: "desc" }, { externalId: "desc" }],
      select: {
        externalId: true,
        fullName: true,
        status: true,
        joinedAt: true,
        user: { select: { externalId: true, email: true, mobile: true, status: true } },
        coordinator: {
          select: { externalId: true, referralCode: true, member: { select: { fullName: true } } },
        },
      },
    }),
  ]);
  return { total, page: query.page, members };
}

export async function adminMemberDetail(externalId: string, actorId: string) {
  z.string().uuid().parse(externalId);
  const member = await prisma.member.findUnique({
    where: { externalId },
    select: {
      id: true,
      externalId: true,
      fullName: true,
      address: true,
      status: true,
      joinedAt: true,
      closedAt: true,
      deceasedAt: true,
      user: {
        select: {
          externalId: true,
          email: true,
          mobile: true,
          emailVerifiedAt: true,
          mobileVerifiedAt: true,
          status: true,
          roles: {
            select: {
              active: true,
              role: {
                select: {
                  code: true,
                  name: true,
                  permissions: { select: { permission: { select: { code: true } } } },
                },
              },
            },
          },
        },
      },
      coordinator: {
        select: { externalId: true, referralCode: true, member: { select: { fullName: true } } },
      },
      memberships: {
        select: { status: true, startedAt: true, endedAt: true },
        orderBy: { startedAt: "desc" },
        take: 100,
      },
      plans: {
        select: {
          externalId: true,
          status: true,
          activatedAt: true,
          waitingEndsAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      dues: {
        select: {
          externalId: true,
          amountPaise: true,
          purpose: true,
          status: true,
          dueAt: true,
          paidAt: true,
        },
        orderBy: { dueAt: "desc" },
        take: 100,
      },
      payments: {
        select: {
          externalId: true,
          amountPaise: true,
          method: true,
          status: true,
          createdAt: true,
          receipt: { select: { receiptNumber: true, issuedAt: true } },
          refund: { select: { externalId: true, status: true, amountPaise: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      wallet: {
        select: {
          balancePaise: true,
          transactions: {
            select: {
              direction: true,
              amountPaise: true,
              balanceAfterPaise: true,
              purpose: true,
              relatedExternalId: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          },
        },
      },
      nominees: {
        select: {
          externalId: true,
          fullName: true,
          kind: true,
          relationship: true,
          status: true,
          isCurrent: true,
          documents: { select: { contentType: true } },
        },
      },
      transfers: {
        select: { effectiveAt: true, reason: true },
        orderBy: { effectiveAt: "desc" },
        take: 100,
      },
      deathCases: {
        select: {
          externalId: true,
          status: true,
          dateOfDeath: true,
          documents: {
            select: {
              externalId: true,
              originalFilename: true,
              contentType: true,
              uploadedAt: true,
            },
          },
        },
        take: 50,
      },
    },
  });
  if (!member) throw new Error("Member not found");
  // Profile reads are audited, without copying personal fields into the log.
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "ADMIN_MEMBER_PROFILE_VIEWED",
      entityType: "Member",
      entityId: member.id,
    },
  });
  const { id: internalId, ...safe } = member;
  void internalId;
  return safe;
}
