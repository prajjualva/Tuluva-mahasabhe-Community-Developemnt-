import { describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import { readOwnMemberCard } from "../src/server/members/member-card-service";

const databaseDescribe = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
databaseDescribe("database-backed membership ID card", () => {
  it("uses the billing anchor, personal details and live Coordinator appointment without granting inactive validity", async () => {
    const member = await prisma.member.create({
      data: {
        fullName: "Card test member",
        address: "Private test address",
        joinedAt: new Date("2024-02-29T12:00:00Z"),
        membershipBillingAnchor: new Date("2024-02-29T12:00:00Z"),
        user: { create: { email: `card-${crypto.randomUUID()}@example.invalid`, mobile: null } },
      },
    });
    const now = new Date("2026-11-19T12:00:00Z");
    await prisma.due.create({
      data: {
        memberId: member.id,
        purpose: "MEMBERSHIP",
        amountPaise: 36900,
        status: "PAID",
        createdAt: now,
        dueAt: new Date("2026-05-29T12:00:00Z"),
      },
    });
    const original = await readOwnMemberCard(member.userId, now);
    expect(original.designation).toBe("Member");
    expect(original.validity).toEqual({ label: "Valid until", value: "28 Feb 2027" });
    expect(original.address).toBe("Private test address");
    expect(original.user.mobile).toBeNull();
    const appointment = await prisma.coordinator.create({
      data: { memberId: member.id, referralCode: `CARD-${crypto.randomUUID()}` },
    });
    await prisma.userRole.create({
      data: {
        user: { connect: { id: member.userId } },
        role: { connect: { code: "COORDINATOR" } },
      },
    });
    expect((await readOwnMemberCard(member.userId, now)).designation).toBe("Coordinator");
    await prisma.coordinator.update({
      where: { id: appointment.id },
      data: { isSuspended: true, status: "SUSPENDED" },
    });
    expect((await readOwnMemberCard(member.userId, now)).designation).toBe("Member");
    await prisma.member.update({ where: { id: member.id }, data: { status: "INACTIVE" } });
    expect((await readOwnMemberCard(member.userId, now)).validity.value).toBe("Inactive");
  }, 180_000);
});
