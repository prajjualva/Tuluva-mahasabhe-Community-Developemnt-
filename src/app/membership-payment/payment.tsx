"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { readOwnOnboarding } from "../../server/members/onboarding-service";
import { openGatewayCheckout, type Checkout } from "../components/gateway-checkout";
import { OtpWorkflow } from "../components/otp-workflow";

type State = Awaited<ReturnType<typeof readOwnOnboarding>>;
export function MembershipPayment({ initial, emailOnly }: { initial: State; emailOnly: boolean }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const command = useRef<string | null>(null);
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    (state.due?.amountPaise ?? 0) / 100,
  );
  const refresh = useCallback(async () => {
    const response = await fetch("/api/member/onboarding", { cache: "no-store" });
    if (response.ok) {
      const next = await response.json();
      setState(next);
    } else if (response.status === 403 || response.status === 401)
      setMessage("Your session expired. Sign in again to continue your existing payment.");
  }, []);
  useEffect(() => {
    if (!state.paymentRequired) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(() => undefined);
    }, 5000);
    return () => clearInterval(interval);
  }, [state.paymentRequired, refresh]);
  async function pay() {
    if (busy || !state.due) return;
    setBusy(true);
    setMessage("");
    command.current ??= crypto.randomUUID();
    try {
      const pending = state.pendingPayment;
      const response = await fetch(
        pending ? `/api/member/payments/${pending.externalId}/resume` : "/api/member/payments",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          ...(!pending && {
            body: JSON.stringify({
              dueId: state.due.externalId,
              method: state.walletBalancePaise >= state.due.amountPaise ? "WALLET" : "ONLINE",
              idempotencyKey: command.current,
            }),
          }),
        },
      );
      const result: { error?: string; checkout?: Checkout; status?: string } =
        await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? "Payment could not be started. Check its status before trying again.",
        );
      if (result.checkout) {
        await openGatewayCheckout(result.checkout);
        setMessage(
          "Complete the checkout. Access opens only after the Foundation receives verified payment confirmation.",
        );
      }
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Payment is unavailable. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!state.pendingPayment || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/member/payments/${state.pendingPayment.externalId}/cancel`,
        { method: "POST" },
      );
      if (!response.ok)
        throw new Error("This payment cannot be cancelled. Check its status first.");
      command.current = null;
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cancellation unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="onboarding-content">
      <p className="eyebrow">YOUR MEMBERSHIP</p>
      <h1>
        {state.paymentRequired
          ? "One step to join your community."
          : "Welcome to Tuluva Mahasabhe."}
      </h1>
      <ol className="onboarding-steps" aria-label="Registration steps">
        <li>Account & photo</li>
        <li aria-current={state.paymentRequired ? "step" : undefined}>Membership payment</li>
        <li aria-current={!state.paymentRequired ? "step" : undefined}>Your membership pack</li>
      </ol>
      {state.paymentRequired ? (
        <article>
          <p>
            Hi {state.fullName}, your account is ready. Complete your initial annual membership
            payment to open the member workspace.
          </p>
          <h2>{amount}</h2>
          <p>Annual membership fee</p>
          {state.due?.payable ? (
            <>
              <button
                disabled={
                  busy ||
                  !!(state.pendingPayment && state.pendingPayment.method !== "ONLINE") ||
                  (!state.onlineAvailable && state.walletBalancePaise < state.due.amountPaise)
                }
                onClick={() => void pay()}
              >
                {busy
                  ? "Please wait…"
                  : state.pendingPayment
                    ? state.pendingPayment.method === "ONLINE"
                      ? "Continue payment"
                      : "Awaiting Foundation verification"
                    : state.walletBalancePaise >= state.due.amountPaise
                      ? `Pay ${amount} from wallet`
                      : `Pay ${amount} securely`}
              </button>
              {state.pendingPayment && state.pendingPayment.method !== "ONLINE" && (
                <p>
                  Your Coordinator payment is awaiting Foundation verification. Please do not pay
                  again.
                </p>
              )}
              {!state.onlineAvailable && state.walletBalancePaise < state.due.amountPaise && (
                <p>
                  Online checkout is temporarily unavailable. Your account is saved. Contact your
                  Coordinator if you need to pay manually; access opens after Foundation
                  verification.
                </p>
              )}
              {state.pendingPayment?.canCancel && (
                <button className="secondary" disabled={busy} onClick={() => void cancel()}>
                  Cancel unstarted payment
                </button>
              )}
            </>
          ) : (
            <p>
              Your payment needs Foundation review. Contact your Coordinator or tuluworld@gmail.com;
              do not make a duplicate payment.
            </p>
          )}
          <p>
            Your ID card, certificate and receipt will be issued after verified payment. Community
            Support Plan registration and benefits are separate.
          </p>
        </article>
      ) : (
        <article>
          <h2>
            {state.grantApproved
              ? "Membership granted by Foundation Admin"
              : "Membership payment verified"}
          </h2>
          <p>
            Your membership ID card, certificate and{" "}
            {state.grantApproved ? "fee exemption record" : "payment receipt"} are ready.{" "}
            {state.emailVerified
              ? "Your welcome pack is queued for email delivery."
              : "Verify your email below to receive them securely."}
          </p>
          <div className="onboarding-actions">
            <Link className="button-link" href="/member">
              Open my dashboard
            </Link>
            <Link href="/member/membership-documents">Download membership documents</Link>
          </div>
        </article>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {!state.emailVerified && <OtpWorkflow member emailOnly={emailOnly} />}
      <p>
        <Link href="/login?next=%2Fmembership-payment">Sign in again</Link> ·{" "}
        <Link href="/delete-account">Account deletion</Link>
      </p>
    </section>
  );
}
