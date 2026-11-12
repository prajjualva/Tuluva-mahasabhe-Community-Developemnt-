import { z } from "zod";

export type OtpDelivery = {
  destination: string;
  code: string;
  purpose: string;
  expiresInSeconds: number;
};
export interface OtpDeliveryProvider {
  send(message: OtpDelivery): Promise<void>;
}

export function isEmailOnlyPilot(environment: Record<string, string | undefined> = process.env) {
  return environment.EMAIL_ONLY_PILOT === "1";
}

/** Explicit providers fail closed: never fall back after a configured provider fails. */
export function otpDeliveryFor(
  channel: "EMAIL" | "SMS",
  environment: Record<string, string | undefined> = process.env,
): OtpDeliveryProvider | null {
  if (channel === "SMS" && isEmailOnlyPilot(environment)) return null;
  if (channel === "EMAIL" && environment.EMAIL_PROVIDER === "resend") {
    const key = environment.RESEND_API_KEY;
    const sender = z.string().email().safeParse(environment.RESEND_FROM_EMAIL);
    if (!key || /\s/.test(key) || !sender.success)
      throw new Error("Resend email requires a server-side API key and valid sender address");
    const domain = sender.data.split("@")[1].toLowerCase();
    if (
      (environment.NODE_ENV === "production" || environment.VERCEL === "1") &&
      (domain === "resend.dev" || domain.endsWith(".resend.dev"))
    )
      throw new Error("Production email requires a verified Foundation sending domain");
    return {
      async send(message) {
        try {
          // One validated recipient, plain text only, no tracking or copied PII.
          const input = z
            .object({
              destination: z.string().email(),
              code: z.string().regex(/^\d{6}$/),
              purpose: z.enum([
                "LOGIN",
                "PASSWORD_RESET",
                "VERIFY_EMAIL",
                "VERIFY_MOBILE",
                "CHANGE_EMAIL",
                "CHANGE_MOBILE",
              ]),
              expiresInSeconds: z.number().int().positive().max(3600),
            })
            .parse(message);
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
            body: JSON.stringify({
              from: `TuluWorld Foundation <${sender.data}>`,
              to: [input.destination],
              subject: "Your TuluWorld Foundation verification code",
              text: [
                "TuluWorld Foundation",
                "",
                `Your verification code is: ${input.code}`,
                `It expires in ${Math.ceil(input.expiresInSeconds / 60)} minutes.`,
                "Do not share this code. The Foundation will never ask you to disclose it.",
                "If you did not request this code, you can ignore this email.",
              ].join("\n"),
            }),
            signal: AbortSignal.timeout(10_000),
            redirect: "error",
          });
          if (!response.ok) throw new Error();
          // A malformed or API-level error response is not a successful handoff.
          const result = await response.json();
          if (!z.object({ id: z.string().min(1) }).safeParse(result).success) throw new Error();
        } catch {
          // Provider diagnostics, validation input and network errors can echo secrets.
          throw new Error("Verification delivery failed");
        }
      },
    };
  }
  if (channel === "EMAIL" && environment.EMAIL_PROVIDER && environment.EMAIL_PROVIDER !== "bridge")
    throw new Error("Unsupported email delivery provider");
  const target = environment[channel === "EMAIL" ? "EMAIL_TRANSPORT_URL" : "SMS_TRANSPORT_URL"];
  const token = environment[channel === "EMAIL" ? "EMAIL_TRANSPORT_TOKEN" : "SMS_TRANSPORT_TOKEN"];
  if (!target || !token) return null;
  const url = new URL(target);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Verification delivery requires HTTPS without embedded credentials");
  return {
    async send(message) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel, ...message }),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      // Never return or log the delivery provider's response, which can echo the OTP.
      if (!response.ok) throw new Error("Verification delivery failed");
    },
  };
}
