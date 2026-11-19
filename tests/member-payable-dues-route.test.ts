import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/member/dues/route";
import { prisma } from "../src/server/database/prisma";

vi.mock("../src/server/http/authorize", () => ({
  requireApiPermission: vi.fn().mockResolvedValue({ userId: "member-user" }),
}));
vi.mock("../src/server/payments/payment-service", () => ({
  memberIdForUser: vi.fn().mockResolvedValue("member-record"),
}));
vi.mock("../src/server/database/prisma", () => ({
  prisma: { due: { findMany: vi.fn() }, contribution: { findMany: vi.fn() } },
}));

afterEach(() => vi.useRealTimers());

it("hides expired plan registration dues while retaining expired membership and contributions", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));

  const due = (id: string, purpose: string, status: "PENDING" | "EXPIRED", expired: boolean) => ({
    id,
    externalId: `public-${id}`,
    purpose,
    amountPaise: 10000,
    dueAt: new Date(expired ? "2026-11-17T12:00:00Z" : "2026-11-19T12:00:00Z"),
    status,
  });
  vi.mocked(prisma.due.findMany).mockResolvedValue([
    due("expired-plan", "PLAN_REGISTRATION", "EXPIRED", true),
    due("pending-past-deadline", "PLAN_REGISTRATION", "PENDING", true),
    due("payable-plan", "PLAN_REGISTRATION", "PENDING", false),
    due("membership", "MEMBERSHIP", "EXPIRED", true),
    due("contribution", "CONTRIBUTION", "EXPIRED", true),
  ] as Awaited<ReturnType<typeof prisma.due.findMany>>);
  vi.mocked(prisma.contribution.findMany).mockResolvedValue([]);

  const response = await GET(new NextRequest("https://example.invalid/api/member/dues"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.map((entry: { externalId: string }) => entry.externalId)).toEqual([
    "public-payable-plan",
    "public-membership",
    "public-contribution",
  ]);
  expect(body.every((entry: object) => !("id" in entry))).toBe(true);
});
