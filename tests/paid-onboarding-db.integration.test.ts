import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { prisma } from "../src/server/database/prisma";
import { registerMemberPersistently } from "../src/server/members/registration-service";
import { normalizeProfilePhoto } from "../src/server/members/profile-photo-service";
import { loginDestination } from "../src/server/auth/login-destination";
import { persistSession, signAccessToken } from "../src/server/auth/session";
import {
  requireApiPermission,
  requirePermissionForAccessToken,
} from "../src/server/http/authorize";
import {
  createPaymentCommand,
  failPayment,
  settlePayment,
} from "../src/server/payments/payment-service";
import {
  applyFoundationWalletCredit,
  payDueFromWallet,
} from "../src/server/payments/wallet-service";
import { requestPaymentRefund } from "../src/server/payments/payment-refund-service";
import {
  collectCashForDue,
  verifyCashCollection,
} from "../src/server/coordinators/cash-payment-service";
import {
  submitCashDeposit,
  verifyCashDeposit,
} from "../src/server/coordinators/cash-reconciliation-service";
import { readOwnMembershipPack } from "../src/server/members/membership-pack-service";
import { deliverQueuedNotifications } from "../src/server/notifications/notification-delivery-service";
import { POST as initiatePayment } from "../src/app/api/member/payments/route";
import { POST as registerRoute } from "../src/app/api/auth/register/route";
import { administerInitialMembership } from "../src/server/admin/admin-membership-access-service";
import { GET as downloadDocument } from "../src/app/api/member/membership-documents/[packId]/[kind]/route";

const databaseDescribe = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
async function fixture() {
  const marker = crypto.randomUUID();
  const coordinator = await prisma.coordinator.create({
    data: {
      referralCode: `JOIN-${marker.slice(0, 20).toUpperCase()}`,
      member: {
        create: {
          fullName: "Onboarding Coordinator",
          address: "Isolated test address",
          user: { create: { email: `coordinator-${marker}@example.invalid` } },
        },
      },
    },
    include: { member: true },
  });
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#164432" } })
    .png()
    .toBuffer();
  const photo = await normalizeProfilePhoto(png, "image/png");
  const input = {
    fullName: "Isolated onboarding member",
    address: "Isolated test address",
    email: `join-${marker}@example.invalid`,
    mobile: `+919${parseInt(marker.slice(0, 8), 16).toString().padStart(10, "0")}`,
    referralCode: coordinator.referralCode,
    password: "Isolated-onboarding-password-only",
  };
  const registered = await registerMemberPersistently(input, photo);
  const member = await prisma.member.findUniqueOrThrow({
    where: { externalId: registered.memberExternalId },
  });
  const token = await signAccessToken(member.userId, []);
  await persistSession(token, member.userId);
  return { member, registered, coordinator, input, photo, token };
}
const requestFor = (token: string, path: string, method = "GET", body?: unknown) =>
  new NextRequest(`https://foundation.example${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

databaseDescribe("paid registration and persistent membership welcome pack", () => {
  it("requires an active Admin, explicit received-funds confirmation and a reason; an offline confirmation produces real records only once", async () => {
    const { member } = await fixture();
    const admin = await prisma.user.create({
      data: {
        email: `manual-admin-${crypto.randomUUID()}@example.invalid`,
        roles: { create: { role: { connect: { code: "ADMIN" } } } },
      },
    });
    const input = {
      action: "RECORD_PAYMENT" as const,
      memberExternalId: member.externalId,
      reason: "Foundation bank transfer verified",
      idempotencyKey: crypto.randomUUID(),
      reference: `BANK-${crypto.randomUUID()}`,
      receivedAt: new Date().toISOString(),
      fundsReceived: true,
    };
    await expect(administerInitialMembership(member.userId, input)).rejects.toThrow("Forbidden");
    await expect(
      administerInitialMembership(admin.id, { ...input, fundsReceived: false }),
    ).rejects.toThrow();
    await expect(administerInitialMembership(admin.id, { ...input, reason: "" })).rejects.toThrow();
    const result = await administerInitialMembership(admin.id, input);
    expect(result.status).toBe("SUCCEEDED");
    expect(await administerInitialMembership(admin.id, input)).toEqual(result);
    await expect(
      administerInitialMembership(admin.id, { ...input, reference: "DIFFERENT-REFERENCE" }),
    ).rejects.toThrow("Idempotency");
    expect(
      await prisma.payment.count({
        where: { memberId: member.id, status: "SUCCEEDED", method: "MANUAL" },
      }),
    ).toBe(1);
    expect(
      await prisma.foundationLedger.count({
        where: {
          purpose: "MEMBERSHIP",
          relatedExternalId: (
            await prisma.payment.findFirstOrThrow({ where: { memberId: member.id } })
          ).externalId,
        },
      }),
    ).toBe(1);
    expect(await loginDestination(member.userId)).toBe("/member");
    expect(await readOwnMembershipPack(member.userId)).not.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorId: admin.id, action: "ADMIN_MEMBERSHIP_PAYMENT_CONFIRMED" },
    });
    expect(audit.reason).toBe(input.reason);
  }, 180_000);
  it("grants initial membership with identity/time/reason and documents while recording no fictional payment or financial receipt", async () => {
    const { member } = await fixture();
    const admin = await prisma.user.create({
      data: {
        email: `grant-admin-${crypto.randomUUID()}@example.invalid`,
        roles: { create: { role: { connect: { code: "ADMIN" } } } },
      },
    });
    const input = {
      action: "GRANT" as const,
      memberExternalId: member.externalId,
      reason: "Foundation approved an initial fee exemption",
      idempotencyKey: crypto.randomUUID(),
      confirmFeeExemption: true,
    };
    const pending = await createPaymentCommand({
      memberId: member.id,
      dueId: member.registrationDueId!,
      actorId: member.userId,
      method: "ONLINE",
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(administerInitialMembership(admin.id, input)).rejects.toThrow("pending payment");
    await failPayment(pending.id, member.userId);
    const result = await administerInitialMembership(admin.id, input);
    expect(result.status).toBe("FEE_EXEMPT");
    expect(await administerInitialMembership(admin.id, input)).toEqual(result);
    expect(await loginDestination(member.userId)).toBe("/member");
    expect(
      await prisma.payment.count({ where: { memberId: member.id, status: "SUCCEEDED" } }),
    ).toBe(0);
    expect(await prisma.receipt.count({ where: { payment: { memberId: member.id } } })).toBe(0);
    const grant = await prisma.membershipGrant.findUniqueOrThrow({
      where: { memberId: member.id },
    });
    expect(grant.approvedById).toBe(admin.id);
    expect(grant.approvedAt).toBeInstanceOf(Date);
    expect(grant.reason).toBe(input.reason);
    const pack = await readOwnMembershipPack(member.userId);
    expect(pack?.grant?.externalId).toBe(grant.externalId);
    expect(pack?.payment).toBeNull();
    expect(
      await prisma.notification.count({
        where: { userId: member.userId, type: "MEMBERSHIP_GRANTED" },
      }),
    ).toBe(1);
  }, 180_000);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("requires an image in the public registration API and sends a private session straight to the payment step", async () => {
    const { input, photo } = await fixture();
    const marker = crypto.randomUUID();
    const form = new FormData();
    for (const [key, value] of Object.entries({
      ...input,
      email: `public-${marker}@example.invalid`,
      mobile: `+918${parseInt(marker.slice(0, 8), 16).toString().padStart(10, "0")}`,
    }))
      form.set(key, value);
    form.set("photo", new File([new Uint8Array(photo)], "photo.webp", { type: "image/webp" }));
    const response = await registerRoute(
      new NextRequest("https://foundation.example/api/auth/register", {
        method: "POST",
        body: form,
      }),
    );
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.redirectTo).toBe("/membership-payment");
    expect(result).not.toHaveProperty("userId");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    form.delete("photo");
    const missing = await registerRoute(
      new NextRequest("https://foundation.example/api/auth/register", {
        method: "POST",
        body: form,
      }),
    );
    expect(missing.status).toBe(400);
  }, 120_000);
  it("persists the required photo and gates both direct pages and APIs; another due cannot bypass enrollment", async () => {
    const { member, token, input } = await fixture();
    expect(await prisma.memberProfilePhoto.count({ where: { memberId: member.id } })).toBe(1);
    expect(await loginDestination(member.userId)).toBe("/membership-payment");
    await expect(requirePermissionForAccessToken(token, "member:profile:read")).rejects.toThrow(
      "initial membership payment",
    );
    await expect(
      requireApiPermission(requestFor(token, "/api/member/wallet"), "member:profile:read"),
    ).rejects.toThrow("initial membership payment");
    expect(
      (
        await requireApiPermission(
          requestFor(token, "/api/member/onboarding"),
          "member:profile:read",
        )
      ).userId,
    ).toBe(member.userId);
    const otherDue = await prisma.due.create({
      data: { memberId: member.id, purpose: "CONTRIBUTION", amountPaise: 10000, dueAt: new Date() },
    });
    const response = await initiatePayment(
      requestFor(token, "/api/member/payments", "POST", {
        dueId: otherDue.externalId,
        method: "WALLET",
        idempotencyKey: crypto.randomUUID(),
      }),
    );
    expect(response.status).toBe(403);
    expect(await prisma.payment.count({ where: { memberId: member.id } })).toBe(0);
    await expect(
      registerMemberPersistently(
        { ...input, email: `missing-${crypto.randomUUID()}@example.invalid` },
        Buffer.alloc(0),
      ),
    ).rejects.toThrow("photo");
    const blockedDue = await prisma.due.create({
      data: { memberId: member.id, purpose: "MEMBERSHIP", amountPaise: 36900, dueAt: new Date() },
    });
    const otherPayment = await createPaymentCommand({
      memberId: member.id,
      dueId: blockedDue.id,
      actorId: member.userId,
      method: "ONLINE",
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      requireApiPermission(
        requestFor(token, `/api/member/payments/${otherPayment.externalId}/resume`, "POST"),
        "member:profile:write",
      ),
    ).rejects.toThrow("initial membership payment");
  }, 120_000);
  it("does not unlock failed/pending/waived enrollment; verified capture issues exactly one pack and receipt", async () => {
    const { member } = await fixture();
    const failed = await createPaymentCommand({
      memberId: member.id,
      dueId: member.registrationDueId!,
      actorId: member.userId,
      method: "ONLINE",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(await loginDestination(member.userId)).toBe("/membership-payment");
    await failPayment(failed.id, member.userId);
    expect(await prisma.membershipPack.count({ where: { memberId: member.id } })).toBe(0);
    const payment = await createPaymentCommand({
      memberId: member.id,
      dueId: member.registrationDueId!,
      actorId: member.userId,
      method: "ONLINE",
      idempotencyKey: crypto.randomUUID(),
    });
    const reference = `capture-${crypto.randomUUID()}`;
    await Promise.all([
      settlePayment(payment.id, undefined, reference),
      settlePayment(payment.id, undefined, reference),
    ]);
    expect(await loginDestination(member.userId)).toBe("/member");
    expect(await prisma.membershipPack.count({ where: { paymentId: payment.id } })).toBe(1);
    expect(await prisma.receipt.count({ where: { paymentId: payment.id } })).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: member.userId, type: "MEMBERSHIP_ACTIVATED" },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "MEMBERSHIP_PACK_ISSUED",
          entityId: (await readOwnMembershipPack(member.userId))!.id,
        },
      }),
    ).toBe(1);
  }, 120_000);
  it("settles wallet enrollment once, protects document ownership and removes access after a completed refund", async () => {
    const { member, token } = await fixture();
    await applyFoundationWalletCredit(
      member.id,
      36900,
      "TEST",
      member.userId,
      "Isolated test allocation",
      crypto.randomUUID(),
    );
    const key = crypto.randomUUID();
    const result = await payDueFromWallet(member.id, member.registrationDueId!, member.userId, key);
    await payDueFromWallet(member.id, member.registrationDueId!, member.userId, key);
    expect((await requirePermissionForAccessToken(token, "member:profile:read")).userId).toBe(
      member.userId,
    );
    const pack = await readOwnMembershipPack(member.userId);
    expect(pack?.photoBytes?.length).toBeGreaterThan(0);
    expect(await readOwnMembershipPack(crypto.randomUUID(), pack!.externalId)).toBeNull();
    const file = await downloadDocument(
      requestFor(token, `/api/member/membership-documents/${pack!.externalId}/certificate`),
      { params: Promise.resolve({ packId: pack!.externalId, kind: "certificate" }) },
    );
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    await requestPaymentRefund({
      paymentExternalId: result.payment.externalId,
      actorId: member.userId,
      reason: "Isolated test refund",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(await loginDestination(member.userId)).toBe("/membership-payment");
    expect(await readOwnMembershipPack(member.userId)).toBeNull();
    expect(await prisma.membershipPack.count({ where: { memberId: member.id } })).toBe(1);
  }, 120_000);
  it("waits for Admin verification of Coordinator cash before unlocking or issuing a pack", async () => {
    const { member, coordinator, registered } = await fixture();
    const payment = await collectCashForDue({
      coordinatorUserId: coordinator.member.userId,
      memberExternalId: member.externalId,
      dueExternalId: registered.membershipDueExternalId,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(await loginDestination(member.userId)).toBe("/membership-payment");
    expect(await prisma.membershipPack.count({ where: { memberId: member.id } })).toBe(0);
    const collection = await prisma.cashCollection.findFirstOrThrow({
      where: { paymentId: payment.id },
    });
    await expect(
      verifyCashCollection(collection.externalId, coordinator.member.userId, true),
    ).rejects.toThrow("remittance evidence");
    const admin = await prisma.user.create({
      data: {
        email: `onboarding-admin-${crypto.randomUUID()}@example.invalid`,
        roles: { create: { role: { connect: { code: "ADMIN" } } } },
      },
    });
    const deposit = await submitCashDeposit(
      coordinator.member.userId,
      {
        collectionExternalIds: [collection.externalId],
        amountPaise: 36900,
        bankReference: `JOIN-${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      },
      new File(["%PDF-1.4\nIsolated remittance evidence\n%%EOF"], "evidence.pdf", {
        type: "application/pdf",
      }),
    );
    await verifyCashDeposit(admin.id, deposit.externalId, {
      approved: true,
      reason: "Isolated remittance verified",
      allocations: [{ collectionExternalId: collection.externalId, receivedAmountPaise: 36900 }],
    });
    expect(await loginDestination(member.userId)).toBe("/member");
    expect(await prisma.membershipPack.count({ where: { paymentId: payment.id } })).toBe(1);
  }, 120_000);
  it("defers private documents until email verification, then sends the three PDFs once with controlled welcome copy", async () => {
    const { member } = await fixture();
    await applyFoundationWalletCredit(
      member.id,
      36900,
      "TEST",
      member.userId,
      "Isolated test allocation",
      crypto.randomUUID(),
    );
    await payDueFromWallet(
      member.id,
      member.registrationDueId!,
      member.userId,
      crypto.randomUUID(),
    );
    const pack = await readOwnMembershipPack(member.userId);
    vi.stubEnv("AUTH_SECRET", "isolated-membership-notification-secret-only-0001");
    vi.stubEnv("APP_URL", "https://foundation.example");
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_FROM_EMAIL", "support@foundation.example");
    vi.stubEnv("RESEND_API_KEY", "isolated-test-only");
    vi.stubEnv("EMAIL_ONLY_PILOT", "1");
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "test-message" }));
    vi.stubGlobal("fetch", send);
    await deliverQueuedNotifications({ relatedExternalId: pack!.externalId });
    expect(send).not.toHaveBeenCalled();
    await prisma.user.update({
      where: { id: member.userId },
      data: { emailVerifiedAt: new Date() },
    });
    await Promise.all([
      deliverQueuedNotifications({ userId: member.userId, limit: 20 }),
      deliverQueuedNotifications({ userId: member.userId, limit: 20 }),
    ]);
    const welcome = send.mock.calls
      .map(([, options]) => JSON.parse(String(options?.body)))
      .filter((body) => body.subject === "Welcome to Tuluva Mahasabhe");
    expect(welcome).toHaveLength(1);
    expect(welcome[0].attachments).toHaveLength(3);
    for (const attachment of welcome[0].attachments)
      expect(Buffer.from(attachment.content, "base64").subarray(0, 4).toString()).toBe("%PDF");
    expect(welcome[0].text).not.toContain("password");
  }, 180_000);
});
