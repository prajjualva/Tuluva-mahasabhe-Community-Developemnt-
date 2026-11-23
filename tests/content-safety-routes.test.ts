import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  report: vi.fn(),
  block: vi.fn(),
  list: vi.fn(),
  unblock: vi.fn(),
  queue: vi.fn(),
  review: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("../src/server/http/authorize", () => ({ requireApiPermission: mocks.authorize }));
vi.mock("../src/server/community/content-safety", () => ({
  reportContent: mocks.report,
  blockCommentAuthor: mocks.block,
  listOwnBlocks: mocks.list,
  unblockAuthor: mocks.unblock,
  listContentReports: mocks.queue,
  reviewContentReport: mocks.review,
}));
vi.mock("../src/server/security/rate-limit", () => ({
  consumeRateLimit: mocks.limit,
  privateRateLimitKey: () => "opaque-key",
}));
import * as member from "../src/app/api/member/content-safety/route";
import * as admin from "../src/app/api/admin/content-reports/route";
const request = (body: unknown) =>
  new NextRequest("https://example.invalid/api/member/content-safety", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
describe("Content safety route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ userId: "current-actor" });
    mocks.report.mockResolvedValue({ status: "OPEN" });
    mocks.block.mockResolvedValue({ externalId: crypto.randomUUID() });
    mocks.list.mockResolvedValue([]);
    mocks.queue.mockResolvedValue([]);
    mocks.review.mockResolvedValue({ status: "REMOVED" });
  });
  it("denies unauthenticated actions before reading or mutating reports", async () => {
    mocks.authorize.mockRejectedValue(new Error("Unauthenticated"));
    expect((await member.POST(request({ action: "BLOCK", target: {} }))).status).toBe(401);
    expect(mocks.block).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("uses session identity and rejects a forged actor field", async () => {
    expect(
      (await member.POST(request({ action: "BLOCK", target: {}, actorId: "someone-else" }))).status,
    ).toBe(400);
    expect(mocks.block).not.toHaveBeenCalled();
    expect(
      (await member.POST(request({ action: "BLOCK", target: { kind: "NEWS_COMMENT" } }))).status,
    ).toBe(200);
    expect(mocks.block).toHaveBeenCalledWith("current-actor", { kind: "NEWS_COMMENT" });
    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), "member:profile:write");
  });
  it("keeps block lists private and binds unblocking to the current actor", async () => {
    const response = await member.GET(request({}));
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.list).toHaveBeenCalledWith("current-actor");
    const externalId = crypto.randomUUID();
    mocks.unblock.mockResolvedValue({ unblocked: true });
    await member.DELETE(request({ externalId }));
    expect(mocks.unblock).toHaveBeenCalledWith("current-actor", externalId);
  });
  it("requires Admin permission for both report reading and decisions", async () => {
    mocks.authorize.mockRejectedValue(new Error("Forbidden"));
    expect((await admin.GET(request({}))).status).toBe(403);
    expect((await admin.POST(request({}))).status).toBe(403);
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.review).not.toHaveBeenCalled();
    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), "admin:*");
  });
});
