import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../src/server/database/prisma";
import { persistSession, signAccessToken } from "../src/server/auth/session";
import { DELETE, GET, POST } from "../src/app/api/member/profile/photo/route";
import { normalizeProfilePhoto } from "../src/server/members/profile-photo-service";
import { readOwnProfile } from "../src/server/members/profile-service";

const databaseDescribe = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;

databaseDescribe("persistent member profile photos", () => {
  it("scopes photos to the owner, returns only photo metadata with profiles, and audits changes", async () => {
    const createMember = () =>
      prisma.member.create({
        data: {
          fullName: "Photo test member",
          address: "Isolated test address",
          user: {
            create: {
              email: `photo-${crypto.randomUUID()}@example.invalid`,
              roles: { create: { role: { connect: { code: "MEMBER" } } } },
            },
          },
        },
      });
    const [owner, other] = await Promise.all([createMember(), createMember()]);
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#e8f4ee" },
    })
      .png()
      .toBuffer();
    const photo = await normalizeProfilePhoto(png, "image/png");

    const sessionFor = async (userId: string) => {
      const token = await signAccessToken(userId, []);
      await persistSession(token, userId);
      return `Bearer ${token}`;
    };
    const url = "http://localhost/api/member/profile/photo";
    const authorization = await sessionFor(owner.userId);
    const uploaded = await POST(
      new NextRequest(url, {
        method: "POST",
        body: new Uint8Array(png),
        headers: { authorization, "content-type": "image/png" },
      }),
    );
    expect(uploaded.status).toBe(200);
    const { photoUpdatedAt } = await uploaded.json();

    const ownRequest = () => new NextRequest(url, { headers: { authorization } });
    const own = await GET(ownRequest());
    expect(own.headers.get("cache-control")).toBe("private, no-store");
    expect(own.headers.get("content-type")).toBe("image/webp");
    expect(Buffer.from(await own.arrayBuffer())).toEqual(photo);
    expect((await GET(new NextRequest(url))).status).toBe(401);
    expect(
      (
        await GET(
          new NextRequest(url + "?memberId=" + owner.externalId, {
            headers: { authorization: await sessionFor(other.userId) },
          }),
        )
      ).status,
    ).toBe(404);
    const profile = await readOwnProfile(owner.userId);
    expect(profile.photoUpdatedAt?.toISOString()).toEqual(photoUpdatedAt);
    expect(profile).not.toHaveProperty("profilePhoto");

    expect((await DELETE(ownRequest())).status).toBe(200);
    expect((await DELETE(ownRequest())).status).toBe(200);
    expect((await GET(ownRequest())).status).toBe(404);
    const audit = await prisma.auditLog.findMany({
      where: { entityId: owner.id },
      select: { action: true, actorId: true },
    });
    expect(audit).toHaveLength(2);
    expect(audit).toEqual(
      expect.arrayContaining([
        { action: "MEMBER_PROFILE_PHOTO_UPDATED", actorId: owner.userId },
        { action: "MEMBER_PROFILE_PHOTO_REMOVED", actorId: owner.userId },
      ]),
    );
  }, 120_000);
});
