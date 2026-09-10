import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import {
  closeDeathSupportEvent,
  getPublishedDeathSupportEvent,
  linkUnmatchedDeathReportToMember,
  publishDeathSupportEvent,
  reviewDeathReportByAdmin,
  submitDeathReport,
  uploadDeathReportDocument,
} from "../src/server/death/death-workflow-service";
import { removeDeathEvidence } from "../src/server/documents/death-document-storage";

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const databaseDescribe = runDatabaseTests ? describe : describe.skip;
let marker = "";

databaseDescribe("Phase 7 Neon death-support workflow", () => {
  it("creates one approved event and atomically generates only historical non-subject contributions", async () => {
    marker = crypto.randomUUID();
    const joinedBeforeEvent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateOfDeath = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [admin, subjectUser, activeUser, inactiveUser, laterUser, linkUser] = await Promise.all(
      ["admin", "subject", "active", "inactive", "later", "link"].map((kind) =>
        prisma.user.create({ data: { email: `phase7-${kind}-${marker}@example.invalid` } }),
      ),
    );
    const [subject, active, inactive, linkMember] = await Promise.all([
      prisma.member.create({
        data: {
          userId: subjectUser.id,
          fullName: "Phase 7 Subject",
          address: "Test-only record",
          joinedAt: joinedBeforeEvent,
        },
      }),
      prisma.member.create({
        data: {
          userId: activeUser.id,
          fullName: "Phase 7 Active Contributor",
          address: "Test-only record",
          joinedAt: joinedBeforeEvent,
        },
      }),
      prisma.member.create({
        data: {
          userId: inactiveUser.id,
          fullName: "Phase 7 Inactive Contributor",
          address: "Test-only record",
          status: "INACTIVE",
          joinedAt: joinedBeforeEvent,
        },
      }),
      prisma.member.create({
        data: {
          userId: linkUser.id,
          fullName: "Phase 7 Linked Member",
          address: "Test-only record",
          joinedAt: joinedBeforeEvent,
        },
      }),
    ]);

    const unlinked = await submitDeathReport({
      reporterIdentity: "Phase 7 member-not-found reporter",
      placeOfDeath: "Mangaluru",
      dateOfDeath,
      details: "Integration-only unlinked death report",
    });
    expect(unlinked.outcome).toBe("MEMBER_NOT_FOUND");
    if (unlinked.outcome !== "MEMBER_NOT_FOUND")
      throw new Error("Expected an unlinked Member Not Found report");
    const pdfEvidence = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x70, 0x68, 0x61, 0x73, 0x65, 0x37,
    ]);
    const uploadedEvidence = await uploadDeathReportDocument({
      caseExternalId: unlinked.case.externalId,
      reporterAccessToken: unlinked.reportAccessToken,
      file: {
        name: "verification.pdf",
        type: "application/pdf",
        size: pdfEvidence.byteLength,
        arrayBuffer: async () => pdfEvidence.buffer,
      },
    });
    expect(uploadedEvidence).toMatchObject({
      originalFilename: "verification.pdf",
      contentType: "application/pdf",
      sizeBytes: pdfEvidence.byteLength,
    });
    expect(
      await prisma.auditLog.count({
        where: {
          action: "DEATH_EVIDENCE_UPLOADED",
          entityId: uploadedEvidence.externalId,
        },
      }),
    ).toBe(1);
    const linked = await linkUnmatchedDeathReportToMember(unlinked.case.externalId, admin.id, {
      memberExternalId: linkMember.externalId,
    });
    expect(linked).toMatchObject({
      status: "ADMIN_VERIFICATION",
      eligibilityStatus: "INELIGIBLE",
    });

    const report = await submitDeathReport({
      memberExternalId: subject.externalId,
      reporterIdentity: "Phase 7 integration reporter",
      placeOfDeath: "Mangaluru",
      dateOfDeath,
      details: "Integration-only death report",
    });
    expect(report.outcome).toBe("CREATED");
    if (report.outcome !== "CREATED") throw new Error("Expected a created death report");

    const approved = await reviewDeathReportByAdmin(report.case.externalId, admin.id, {
      decision: "APPROVE",
      reason: "Integration verification complete",
      publicDetails: "A verified community notice.",
    });
    expect(approved.decision).toBe("APPROVED");
    const approvedEvent = approved.event;
    if (!approvedEvent) throw new Error("Expected an approved Death Support Event");
    expect(approvedEvent.status).toBe("APPROVED");

    // This member record exists after the event's immutable creation cutoff.
    const later = await prisma.member.create({
      data: {
        userId: laterUser.id,
        fullName: "Phase 7 Later Member",
        address: "Test-only record",
        joinedAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // The shared Neon database can contain development members created before
    // this test. Capture the server's complete historical candidate set rather
    // than assuming this integration test owns every pre-existing member.
    const historicalCandidates = await prisma.member.findMany({
      where: {
        joinedAt: { lte: approvedEvent.createdAt },
        id: { not: subject.id },
      },
      select: { externalId: true },
    });
    const historicalCandidateIds = historicalCandidates.map((member) => member.externalId).sort();
    expect(historicalCandidateIds).toEqual(
      expect.arrayContaining([active.externalId, inactive.externalId]),
    );
    expect(historicalCandidateIds).not.toContain(later.externalId);

    const firstPublication = await publishDeathSupportEvent(approvedEvent.externalId, admin.id);
    const replay = await publishDeathSupportEvent(approvedEvent.externalId, admin.id);
    expect(firstPublication.createdCount).toBe(historicalCandidateIds.length);
    expect(replay.createdCount).toBe(0);

    const event = await prisma.contributionEvent.findUniqueOrThrow({
      where: { externalId: approvedEvent.externalId },
      include: {
        contributions: {
          include: { member: { select: { externalId: true } } },
        },
      },
    });
    const contributionDueIds = event.contributions.flatMap((contribution) =>
      contribution.dueId ? [contribution.dueId] : [],
    );
    const contributionDues = await prisma.due.findMany({
      where: { id: { in: contributionDueIds } },
      select: { status: true },
    });
    expect(event.status).toBe("PUBLISHED");
    expect(
      event.contributions.map((contribution) => contribution.member.externalId).sort(),
    ).toEqual(historicalCandidateIds);
    expect(contributionDues).toHaveLength(historicalCandidateIds.length);
    expect(contributionDues.every((due) => due.status === "PENDING")).toBe(true);
    expect(
      event.contributions.some(
        (contribution) => contribution.member.externalId === subject.externalId,
      ),
    ).toBe(false);
    expect(
      event.contributions.some(
        (contribution) => contribution.member.externalId === later.externalId,
      ),
    ).toBe(false);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: subject.id } })).status).toBe(
      "DECEASED",
    );

    // Closing preserves the verified public notice and its duplicate link,
    // while cancellation is the lifecycle state that removes it from public
    // visibility and starts compensating financial actions.
    await closeDeathSupportEvent(
      approvedEvent.externalId,
      admin.id,
      "Support-event collection complete",
    );
    expect((await getPublishedDeathSupportEvent(approvedEvent.externalId)).externalId).toBe(
      approvedEvent.externalId,
    );
    const duplicateAfterClosure = await submitDeathReport({
      memberExternalId: subject.externalId,
      reporterIdentity: "Phase 7 duplicate reporter",
      placeOfDeath: "Mangaluru",
      dateOfDeath,
    });
    expect(duplicateAfterClosure).toMatchObject({
      outcome: "DUPLICATE",
      existingEventExternalId: approvedEvent.externalId,
    });
  }, 60_000);
});

afterAll(async () => {
  if (!runDatabaseTests || !marker) return;
  const users = await prisma.user.findMany({
    // Cleanup is intentionally constrained to this test suite's impossible
    // production email namespace, including a prior interrupted test attempt.
    where: { email: { startsWith: "phase7-", endsWith: "@example.invalid" } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const members = await prisma.member.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const memberIds = members.map((member) => member.id);
  const cases = await prisma.deathCase.findMany({
    where: { memberId: { in: memberIds } },
    select: { id: true, event: { select: { id: true } } },
  });
  const documents = cases.length
    ? await prisma.deathDocument.findMany({
        where: { deathCaseId: { in: cases.map((deathCase) => deathCase.id) } },
        select: { externalId: true, storageKey: true },
      })
    : [];
  const eventIds = cases.flatMap((deathCase) => (deathCase.event ? [deathCase.event.id] : []));
  const contributions = eventIds.length
    ? await prisma.contribution.findMany({
        where: { eventId: { in: eventIds } },
        select: { id: true, dueId: true },
      })
    : [];
  const contributionIds = contributions.map((contribution) => contribution.id);
  const dueIds = contributions.flatMap((contribution) =>
    contribution.dueId ? [contribution.dueId] : [],
  );

  await prisma.$transaction(
    async (tx) => {
      if (eventIds.length) {
        await tx.comment.deleteMany({ where: { eventId: { in: eventIds } } });
        await tx.contributionEventReversal.deleteMany({
          where: { cancellation: { eventId: { in: eventIds } } },
        });
        await tx.contributionEventCancellation.deleteMany({ where: { eventId: { in: eventIds } } });
        if (contributionIds.length)
          await tx.contribution.deleteMany({ where: { id: { in: contributionIds } } });
        await tx.contributionEvent.deleteMany({ where: { id: { in: eventIds } } });
      }
      if (cases.length) {
        await tx.deathDocument.deleteMany({
          where: { deathCaseId: { in: cases.map((deathCase) => deathCase.id) } },
        });
        await tx.deathCase.deleteMany({
          where: { id: { in: cases.map((deathCase) => deathCase.id) } },
        });
      }
      if (dueIds.length) await tx.due.deleteMany({ where: { id: { in: dueIds } } });
      if (memberIds.length) {
        await tx.membershipPeriod.deleteMany({
          where: { membership: { memberId: { in: memberIds } } },
        });
        await tx.membership.deleteMany({ where: { memberId: { in: memberIds } } });
        await tx.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: userIds } },
              {
                entityId: {
                  in: [
                    ...memberIds,
                    ...cases.map((deathCase) => deathCase.id),
                    ...eventIds,
                    ...documents.map((document) => document.externalId),
                  ],
                },
              },
            ],
          },
        });
        await tx.member.deleteMany({ where: { id: { in: memberIds } } });
      }
      if (userIds.length) await tx.user.deleteMany({ where: { id: { in: userIds } } });
    },
    { timeout: 30_000 },
  );
  await Promise.all(documents.map((document) => removeDeathEvidence(document.storageKey)));
  await prisma.$disconnect();
});
