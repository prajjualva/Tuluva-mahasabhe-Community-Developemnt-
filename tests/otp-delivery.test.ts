import { afterEach, describe, expect, it, vi } from "vitest";
import { otpDeliveryFor } from "../src/server/auth/otp-delivery";

const settings = {
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_synthetic-private-api-token",
  RESEND_FROM_EMAIL: "no-reply@notify.example.org",
};
const message = {
  destination: "member@example.org",
  code: "123456",
  purpose: "PASSWORD_RESET",
  expiresInSeconds: 600,
};
afterEach(() => vi.unstubAllGlobals());

describe("verification delivery providers", () => {
  it("disables configured SMS delivery during the pilot while retaining email delivery", () => {
    const environment = {
      ...settings,
      EMAIL_ONLY_PILOT: "1",
      SMS_TRANSPORT_URL: "https://delivery.example.org/sms",
      SMS_TRANSPORT_TOKEN: "synthetic-sms-token",
    };
    expect(otpDeliveryFor("SMS", environment)).toBeNull();
    expect(otpDeliveryFor("EMAIL", environment)).not.toBeNull();
  });
  it("keeps missing delivery disabled instead of faking success", () => {
    expect(otpDeliveryFor("EMAIL", {})).toBeNull();
    expect(otpDeliveryFor("SMS", settings)).toBeNull();
  });
  it("rejects unsupported providers without leaking the supplied value", () => {
    expect(() => otpDeliveryFor("EMAIL", { EMAIL_PROVIDER: "private-provider-value" })).toThrow(
      "Unsupported email delivery provider",
    );
  });
  it.each([
    { ...settings, RESEND_API_KEY: "" },
    { ...settings, RESEND_API_KEY: "private\r\nvalue" },
    { ...settings, RESEND_FROM_EMAIL: "not-an-email" },
    { ...settings, RESEND_FROM_EMAIL: "one@example.org,two@example.org" },
  ])("fails closed for invalid Resend settings without bridge fallback", (environment) => {
    expect(() =>
      otpDeliveryFor("EMAIL", {
        ...environment,
        EMAIL_TRANSPORT_URL: "https://bridge.example.org",
        EMAIL_TRANSPORT_TOKEN: "synthetic-bridge-token",
      }),
    ).toThrow("Resend email requires a server-side API key and valid sender address");
  });
  it.each([{ NODE_ENV: "production" }, { VERCEL: "1" }])(
    "rejects the provider testing domain for deployed email",
    (environment) => {
      expect(() =>
        otpDeliveryFor("EMAIL", {
          ...settings,
          ...environment,
          RESEND_FROM_EMAIL: "onboarding@resend.dev",
        }),
      ).toThrow("verified Foundation sending domain");
    },
  );
  it("allows a provider testing sender only outside deployed environments", () => {
    expect(
      otpDeliveryFor("EMAIL", {
        ...settings,
        NODE_ENV: "development",
        RESEND_FROM_EMAIL: "onboarding@resend.dev",
      }),
    ).not.toBeNull();
  });
  it("sends one plain-text verification email to the fixed official API", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "provider-message-id" }));
    vi.stubGlobal("fetch", fetcher);
    await otpDeliveryFor("EMAIL", settings)!.send(message);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(request).toMatchObject({
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      redirect: "error",
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    const payload = JSON.parse(request.body);
    expect(payload.to).toEqual([message.destination]);
    expect(payload.from).toBe("TuluWorld Foundation <no-reply@notify.example.org>");
    expect(payload.text).toContain(message.code);
    expect(payload.text).toContain("10 minutes");
    expect(payload.subject).not.toContain(message.code);
    expect(payload).not.toHaveProperty("html");
    expect(request.body).not.toContain(settings.RESEND_API_KEY);
  });
  it.each([400, 403, 429, 500])("fails closed on provider HTTP %i", async (status) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("private-provider-diagnostic-containing-otp", { status }));
    vi.stubGlobal("fetch", fetcher);
    await expect(otpDeliveryFor("EMAIL", settings)!.send(message)).rejects.toThrow(
      /^Verification delivery failed$/,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([{}, { error: "private diagnostic" }, null])(
    "does not accept malformed API success responses",
    async (response) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response)));
      await expect(otpDeliveryFor("EMAIL", settings)!.send(message)).rejects.toThrow(
        /^Verification delivery failed$/,
      );
    },
  );
  it("redacts network and timeout failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network credential")));
    await expect(otpDeliveryFor("EMAIL", settings)!.send(message)).rejects.toThrow(
      /^Verification delivery failed$/,
    );
  });
  it("rejects malformed recipients/codes before contacting the provider", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      otpDeliveryFor("EMAIL", settings)!.send({ ...message, destination: "invalid-recipient" }),
    ).rejects.toThrow(/^Verification delivery failed$/);
    await expect(
      otpDeliveryFor("EMAIL", settings)!.send({ ...message, code: "invalid-code" }),
    ).rejects.toThrow(/^Verification delivery failed$/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("preserves the existing email bridge and SMS contract", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    const bridge = {
      EMAIL_TRANSPORT_URL: "https://delivery.example.org/email",
      EMAIL_TRANSPORT_TOKEN: "synthetic-email-token",
      SMS_TRANSPORT_URL: "https://delivery.example.org/sms",
      SMS_TRANSPORT_TOKEN: "synthetic-sms-token",
    };
    await otpDeliveryFor("EMAIL", bridge)!.send(message);
    await otpDeliveryFor("SMS", { ...settings, ...bridge })!.send(message);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      bridge.EMAIL_TRANSPORT_URL,
      bridge.SMS_TRANSPORT_URL,
    ]);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ channel: "SMS", ...message });
  });
  it("rejects an insecure or credential-bearing bridge URL", () => {
    for (const target of ["http://bridge.example.org", "https://private:secret@bridge.example.org"])
      expect(() =>
        otpDeliveryFor("EMAIL", { EMAIL_TRANSPORT_URL: target, EMAIL_TRANSPORT_TOKEN: "token" }),
      ).toThrow("Verification delivery requires HTTPS without embedded credentials");
  });
});
