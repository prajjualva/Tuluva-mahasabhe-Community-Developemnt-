import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/server/database/prisma";
import { persistSession, signAccessToken } from "../src/server/auth/session";
import { GET, POST, DELETE } from "../src/app/api/account/deletion/route";
import { GET as adminGET, PATCH } from "../src/app/api/admin/account-deletion/route";

const databaseDescribe = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
databaseDescribe("persistent account deletion request access and lifecycle", () => {
  it("records one own request, denies member Admin access and IDOR, audits review and cancellation", async () => {
    const createUser = (role: "MEMBER" | "ADMIN") =>
      prisma.user.create({
        data: {
          email: `delete-${crypto.randomUUID()}@example.invalid`,
          roles: { create: { role: { connect: { code: role } } } },
        },
      });
    const [owner, other, admin] = await Promise.all([
      createUser("MEMBER"),
      createUser("MEMBER"),
      createUser("ADMIN"),
    ]);
    const cookies = async (userId: string) => {
      const token = await signAccessToken(userId, []);
      await persistSession(token, userId);
      return { cookie: `access_token=${token}` };
    };
    const ownerHeaders = await cookies(owner.id);
    const otherHeaders = await cookies(other.id);
    const adminHeaders = await cookies(admin.id);
    const endpoint = "http://localhost/api/account/deletion";
    const own = (method = "GET", body?: object) =>
      new NextRequest(endpoint, {
        method,
        headers: { ...ownerHeaders, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    expect((await GET(new NextRequest(endpoint))).status).toBe(401);
    expect((await POST(own("POST", { confirm: false }))).status).toBe(400);
    const response = await POST(own("POST", { confirm: true }));
    expect(response.status).toBe(200);
    const created = await response.json();
    expect(created.status).toBe("PENDING");
    expect(created).not.toHaveProperty("userId");
    const duplicate = await POST(own("POST", { confirm: true }));
    expect((await duplicate.json()).externalId).toBe(created.externalId);
    expect(await prisma.accountDeletionRequest.count({ where: { userId: owner.id } })).toBe(1);
    expect(
      (
        await GET(
          new NextRequest(endpoint + "?userId=" + owner.externalId, { headers: otherHeaders }),
        )
      ).status,
    ).toBe(200);
    expect(
      await (await GET(new NextRequest(endpoint, { headers: otherHeaders }))).json(),
    ).toBeNull();
    expect(
      (
        await adminGET(
          new NextRequest("http://localhost/api/admin/account-deletion", { headers: ownerHeaders }),
        )
      ).status,
    ).toBe(403);
    const saved = await PATCH(
      new NextRequest("http://localhost/api/admin/account-deletion", {
        method: "PATCH",
        headers: { ...adminHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          requestId: created.externalId,
          memberMessage: "Please contact the Foundation to verify your identity.",
        }),
      }),
    );
    expect(saved.status).toBe(200);
    expect(await (await GET(own())).json()).toMatchObject({
      status: "IN_REVIEW",
      memberMessage: "Please contact the Foundation to verify your identity.",
    });
    expect((await DELETE(own("DELETE"))).status).toBe(200);
    expect((await DELETE(own("DELETE"))).status).toBe(200);
    expect(
      await prisma.auditLog.count({
        where: { entityType: "AccountDeletionRequest", entityId: created.externalId },
      }),
    ).toBe(3);
    expect((await POST(own("POST", { confirm: true }))).status).toBe(200);
    expect(await (await GET(own())).json()).toMatchObject({
      externalId: created.externalId,
      status: "PENDING",
      memberMessage: null,
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).status).toBe(
      "ACTIVE",
    );
  }, 180_000);
});
