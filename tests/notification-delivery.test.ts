import { describe, expect, it, vi } from "vitest";
import { notificationTransport } from "../src/server/notifications/notification-delivery-provider";

const configuration = {
  APP_URL: "https://foundation.example/",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "synthetic-test-key",
  RESEND_FROM_EMAIL: "support@foundation.example",
  SMS_NOTIFICATION_TRANSPORT_URL: "https://bridge.example/notifications",
  SMS_NOTIFICATION_TRANSPORT_TOKEN: "synthetic-bridge-key",
};

const welcome = {
  type: "REGISTRATION",
  template: "MEMBER_REGISTERED",
  destination: "test@example.invalid",
  idempotencyKey: "test-notification-id",
};

describe("transactional notification transports", () => {
  it("sends controlled registration copy and a stable idempotency key to Resend", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "mail-id" }));
    const send = notificationTransport("EMAIL", configuration, request);
    expect(await send?.(welcome)).toBe("ACCEPTED");
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options?.headers).toMatchObject({ "idempotency-key": welcome.idempotencyKey });
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      to: [welcome.destination],
      subject: "Welcome to Tuluva Mahasabhe",
    });
    expect(body.text).toContain("https://foundation.example/login");
    expect(body.text).not.toContain("MEMBER_REGISTERED");
  });

  it("does not mark a rejected or malformed acceptance response as sent", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(new Response(null, { status: 400 }));
    const send = notificationTransport("EMAIL", configuration, request);
    expect(await send?.(welcome)).toBe("RETRY");
    expect(await send?.(welcome)).toBe("RETRY");
    expect(await send?.(welcome)).toBe("FAILED");
  });

  it("keeps SMS off in the email-only pilot and sends approved-template references once configured", async () => {
    expect(notificationTransport("SMS", { ...configuration, EMAIL_ONLY_PILOT: "1" })).toBeNull();
    expect(notificationTransport("SMS", { APP_URL: configuration.APP_URL })).toBeNull();
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "sms-id" }));
    const send = notificationTransport("SMS", configuration, request);
    const destination = "+919000000001";
    expect(await send?.({ ...welcome, type: "DUE_REMINDER", destination })).toBe("ACCEPTED");
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
      destination,
      template: "DUE_REMINDER",
      portalUrl: "https://foundation.example/login",
    });
  });
});
