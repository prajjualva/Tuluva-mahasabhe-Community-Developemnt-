import { z } from "zod";
import { isEmailOnlyPilot } from "../auth/otp-delivery";
import { isReviewWorkspace } from "../deployment/review-environment";

export type ExternalNotificationChannel = "EMAIL" | "SMS";
type DeliveryMessage = {
  destination: string;
  type: string;
  template: string;
  idempotencyKey: string;
};
export type DeliveryResult = "ACCEPTED" | "RETRY" | "FAILED";
export type NotificationTransport = (message: DeliveryMessage) => Promise<DeliveryResult>;

const summaries: Record<string, [string, string]> = {
  REGISTRATION: [
    "Welcome to Tuluva Mahasabhe",
    "Your registration was received. Sign in to review your membership and any dues. If you did not register, ignore this email.",
  ],
  COORDINATOR_ASSIGNED: [
    "Coordinator assignment",
    "Your Coordinator or member assignment was updated.",
  ],
  COORDINATOR_CHANGED: ["Coordinator assignment", "Your Coordinator assignment was updated."],
  COORDINATOR_APPOINTMENT: [
    "Coordinator appointment",
    "You have been appointed as a Coordinator. Sign in to see your referral code and Coordinator tools.",
  ],
  DUE_REMINDER: ["Membership or contribution due", "An outstanding due needs your attention."],
  DUE_EXPIRED: ["Payment deadline passed", "Review your outstanding dues and their status."],
  EVENT_CONTRIBUTION_DUE: [
    "New community support contribution",
    "A new contribution due is available.",
  ],
  MEMBERSHIP_GRACE_PERIOD: [
    "Membership update",
    "Review your membership status and renewal deadline.",
  ],
  PLAN_REGISTRATION: [
    "Community Support Plan update",
    "Review your plan status and any payment deadline.",
  ],
  PLAN_EXPIRY: ["Community Support Plan deadline", "Review your plan registration status."],
  PAYMENT_SUCCEEDED: [
    "Payment received",
    "A payment was recorded. View your payment history and receipt.",
  ],
  PAYMENT_FAILED: ["Payment update", "Review your payment status and next steps."],
  RECEIPT_GENERATED: [
    "Receipt available",
    "An official receipt is available in your payment history.",
  ],
  COMMUNITY_NEWS: [
    "Community update",
    "A community announcement is available in the member portal.",
  ],
};

function portalUrl(environment: Record<string, string | undefined>) {
  try {
    const url = new URL(environment.APP_URL ?? "");
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return new URL("/login", url).href;
  } catch {
    return null;
  }
}

export function notificationTransport(
  channel: ExternalNotificationChannel,
  environment: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
): NotificationTransport | null {
  if (isReviewWorkspace(environment)) return null;
  const portal = portalUrl(environment);
  if (!portal) return null;
  if (channel === "EMAIL") {
    const sender = z.string().email().safeParse(environment.RESEND_FROM_EMAIL);
    const apiKey = environment.RESEND_API_KEY;
    if (environment.EMAIL_PROVIDER !== "resend" || !sender.success || !apiKey || /\s/.test(apiKey))
      return null;
    if (
      (environment.NODE_ENV === "production" || environment.VERCEL === "1") &&
      /(^|[.@])resend\.dev$/i.test(sender.data)
    )
      return null;
    return async ({ destination, type, template, idempotencyKey }) => {
      if (!z.string().email().safeParse(destination).success) return "FAILED";
      // External messages use controlled copy. Inbox titles, bodies and payloads can contain
      // private details or staff-entered text and never leave the member portal.
      const copyKey = template === "COORDINATOR_APPOINTMENT" ? template : type;
      const [subject, summary] = (Object.hasOwn(summaries, copyKey)
        ? summaries[copyKey]
        : undefined) ?? [
        "Tuluva Mahasabhe update",
        "You have a new notification in the member portal.",
      ];
      try {
        const response = await request("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
            "idempotency-key": idempotencyKey,
          },
          body: JSON.stringify({
            from: `Tuluva Mahasabhe <${sender.data}>`,
            to: [destination],
            subject,
            text: `${summary}\n\nSign in to TuluWorld\n${portal}`,
          }),
          signal: AbortSignal.timeout(8000),
          redirect: "error",
        });
        if (!response.ok) return outcomeForStatus(response.status);
        return z.object({ id: z.string().min(1) }).safeParse(await response.json()).success
          ? "ACCEPTED"
          : "RETRY";
      } catch {
        return "RETRY";
      }
    };
  }
  if (isEmailOnlyPilot(environment)) return null;
  const target = environment.SMS_NOTIFICATION_TRANSPORT_URL;
  const token = environment.SMS_NOTIFICATION_TRANSPORT_TOKEN;
  if (!target || !token || /\s/.test(token)) return null;
  let bridge: URL;
  try {
    bridge = new URL(target);
    if (bridge.protocol !== "https:" || bridge.username || bridge.password) return null;
  } catch {
    return null;
  }
  return async ({ destination, type, template, idempotencyKey }) => {
    if (!/^\+[1-9]\d{7,14}$/.test(destination)) return "FAILED";
    try {
      const response = await request(bridge, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          destination,
          template: template === "COORDINATOR_APPOINTMENT" ? template : type,
          portalUrl: portal,
        }),
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });
      if (!response.ok) return outcomeForStatus(response.status);
      return z.object({ id: z.string().min(1) }).safeParse(await response.json()).success
        ? "ACCEPTED"
        : "RETRY";
    } catch {
      return "RETRY";
    }
  };
}

function outcomeForStatus(status: number): DeliveryResult {
  return status === 408 || status === 409 || status === 429 || status >= 500 ? "RETRY" : "FAILED";
}
