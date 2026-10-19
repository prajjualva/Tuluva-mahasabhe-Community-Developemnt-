export type OtpDelivery = {
  destination: string;
  code: string;
  purpose: string;
  expiresInSeconds: number;
};
export interface OtpDeliveryProvider {
  send(message: OtpDelivery): Promise<void>;
}

/** A configured HTTPS delivery bridge can connect the Foundation's chosen email/SMS provider. */
export function otpDeliveryFor(
  channel: "EMAIL" | "SMS",
  environment = process.env,
): OtpDeliveryProvider | null {
  const target = environment[channel === "EMAIL" ? "EMAIL_TRANSPORT_URL" : "SMS_TRANSPORT_URL"];
  const token = environment[channel === "EMAIL" ? "EMAIL_TRANSPORT_TOKEN" : "SMS_TRANSPORT_TOKEN"];
  if (!target || !token) return null;
  const url = new URL(target);
  if (url.protocol !== "https:") throw new Error("Verification delivery requires HTTPS");
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
