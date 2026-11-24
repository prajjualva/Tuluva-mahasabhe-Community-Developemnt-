import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/server/database/prisma";
import { deliverQueuedNotifications } from "../src/server/notifications/notification-delivery-service";

const databaseDescribe = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;

databaseDescribe("persistent notification delivery queue", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("queues bulk events atomically and sends once after a verified contact is available", async () => {
    const marker = crypto.randomUUID();
    const user = await prisma.user.create({ data: { email: `mail-${marker}@example.invalid` } });
    const notification = {
      userId: user.id,
      type: "DUE_REMINDER",
      template: "CONTRIBUTION_DUE_REMINDER",
      title: "Due",
      body: "Private inbox message",
      payload: { privateNote: "never send this" },
      relatedExternalId: marker,
    };
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.notification.createMany({ data: [notification] });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(
      await prisma.notificationDelivery.count({
        where: { notification: { relatedExternalId: marker } },
      }),
    ).toBe(0);
    await prisma.notification.createMany({ data: [notification] });
    expect(
      await prisma.notificationDelivery.count({
        where: { notification: { relatedExternalId: marker } },
      }),
    ).toBe(2);
    vi.stubEnv("AUTH_SECRET", "synthetic-secret-used-only-in-notification-tests");
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "synthetic-test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "support@foundation.example");
    vi.stubEnv("APP_URL", "https://foundation.example");
    vi.stubEnv("EMAIL_ONLY_PILOT", "1");
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "email-id" }));
    vi.stubGlobal("fetch", request);
    const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    // Reproduce an app host behind the database; queue rows use the database clock.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(clock.now.getTime() - 60_000);
    await expect(deliverQueuedNotifications({ relatedExternalId: marker })).resolves.toMatchObject({
      accepted: 0,
      deferred: 1,
    });
    expect(request).not.toHaveBeenCalled();
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    await Promise.all([
      deliverQueuedNotifications({ userId: user.id }),
      deliverQueuedNotifications({ userId: user.id }),
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0][1]?.body)).not.toContain("never send this");
    const deliveries = await prisma.notificationDelivery.findMany({
      where: { notification: { relatedExternalId: marker } },
    });
    expect(deliveries).toContainEqual(
      expect.objectContaining({ channel: "EMAIL", state: "ACCEPTED", attempts: 1 }),
    );
    expect(deliveries).toContainEqual(
      expect.objectContaining({ channel: "SMS", state: "PENDING", attempts: 0 }),
    );
  }, 90_000);
});
