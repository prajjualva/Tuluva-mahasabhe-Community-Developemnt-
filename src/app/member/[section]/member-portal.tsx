"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MemberCommunications } from "../member-communications";
import { MemberProfile } from "../member-profile";
import { readMemberRecord } from "../member-record-loader";
import { paymentStartFeedback, paymentPurposeLabel } from "../payment-feedback";

type Due = {
  externalId: string;
  purpose: string;
  amountPaise: number;
  dueAt: string;
  status: string;
  contributionEventExternalId: string | null;
};
type Plan = {
  externalId?: string;
  status: string;
  activatedAt?: string;
  waitingEndsAt?: string;
  feeExempt?: boolean;
};
type Membership = { status: string; joinedAt: string };
type Checkout = {
  provider: "razorpay";
  paymentExternalId: string;
  orderId: string;
  keyId: string;
  amountPaise: number;
  currency: "INR";
};
type RazorpayConstructor = new (options: Record<string, unknown>) => { open(): void };

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}
type WalletActivity = {
  direction: "CREDIT" | "DEBIT";
  amountPaise: number;
  balanceAfterPaise: number;
  category: string;
  paymentExternalId: string | null;
  createdAt: string;
};
type ReceiptDetail = {
  receiptNumber: string;
  issuedAt: string;
  payment: {
    externalId: string;
    amountPaise: number;
    method: string;
    status: string;
    providerReference: string | null;
    member: { externalId: string; fullName: string } | null;
    due: { externalId: string; purpose: string } | null;
  };
};
const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const key = () => crypto.randomUUID();

async function openGatewayCheckout(checkout: Checkout) {
  if (!window.Razorpay) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load the payment checkout"));
      document.head.appendChild(script);
    });
  }
  if (!window.Razorpay) throw new Error("Payment checkout is unavailable");
  new window.Razorpay({
    key: checkout.keyId,
    amount: checkout.amountPaise,
    currency: checkout.currency,
    order_id: checkout.orderId,
    name: "Community Support Foundation",
    description: "Foundation contribution or membership payment",
    notes: { foundation_payment_external_id: checkout.paymentExternalId },
    handler: () => undefined,
  }).open();
}

export function MemberPortal({ section }: { section: string }) {
  const pageCopy: Record<string, [string, string]> = {
    "payments-receipts": [
      "Payments & Receipts",
      "Track your payments and download official receipts.",
    ],
    dues: ["My dues", "View outstanding contributions and membership payments."],
    wallet: ["Foundation Wallet", "See your wallet balance and recent movements."],
    membership: ["My membership", "Check your membership status and renewal."],
    "community-support-plan": [
      "Community Support Plan",
      "Follow your registration, payment deadline and waiting period.",
    ],
    notifications: ["Notifications", "Read your Foundation updates and reminders."],
    "community-news": [
      "Community news",
      "Stay connected with news and conversations from your community.",
    ],
    dashboard: [
      "My community, my membership",
      "Your membership, community support and important updates—all in one place.",
    ],
  };
  const [plan, setPlan] = useState<Plan | null>(null);
  const [dues, setDues] = useState<Due[]>([]);
  const [wallet, setWallet] = useState<number | null>(null);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [walletActivity, setWalletActivity] = useState<WalletActivity[]>([]);
  const [payments, setPayments] = useState<
    Array<{
      externalId: string;
      amountPaise: number;
      status: string;
      method: string;
      canCancel: boolean;
      canResume: boolean;
    }>
  >([]);
  const [receipts, setReceipts] = useState<Array<{ receiptNumber: string; issuedAt: string }>>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptDetail | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const commandLock = useRef(false);
  async function runAction(operation: () => Promise<void>) {
    if (commandLock.current) return;
    commandLock.current = true;
    setBusy(true);
    try {
      await operation();
    } catch {
      setMessage(
        "Could not complete the request. Check your payment history before retrying a payment.",
      );
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }
  const load = async () => {
    setLoading(true);
    try {
      const [
        planResult,
        dueResult,
        walletResult,
        walletActivityResult,
        paymentResult,
        receiptResult,
        membershipResult,
      ] = await Promise.all([
        readMemberRecord<Plan>("/api/member/plan/status"),
        readMemberRecord<Due[]>("/api/member/dues"),
        readMemberRecord<{ balancePaise: number }>("/api/member/wallet"),
        readMemberRecord<{ activity: WalletActivity[] }>("/api/member/wallet/activity?limit=20"),
        readMemberRecord<typeof payments>("/api/member/payments/history"),
        readMemberRecord<typeof receipts>("/api/member/receipts"),
        readMemberRecord<Membership>("/api/member/membership/status"),
      ]);
      setPlan(planResult.ok ? planResult.data : null);
      setDues(dueResult.ok ? dueResult.data : []);
      setWallet(walletResult.ok ? walletResult.data.balancePaise : null);
      setWalletActivity(walletActivityResult.ok ? walletActivityResult.data.activity : []);
      setPayments(paymentResult.ok ? paymentResult.data : []);
      setReceipts(receiptResult.ok ? receiptResult.data : []);
      setMembership(membershipResult.ok ? membershipResult.data : null);
      const results = [
        planResult,
        dueResult,
        walletResult,
        walletActivityResult,
        paymentResult,
        receiptResult,
        membershipResult,
      ];
      const names = ["plan", "dues", "wallet", "activity", "payments", "receipts", "membership"];
      const failed = names.filter((_, index) => !results[index].ok);
      setLoadErrors(failed);
      if (failed.length)
        setMessage(
          "Some records could not be loaded. Your session may have expired; sign in again or refresh to retry.",
        );
    } catch {
      setLoadErrors(["plan", "dues", "wallet", "activity", "payments", "receipts", "membership"]);
      setMessage("Could not load your records. Check your connection and refresh to retry.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const startPlan = async () => {
    const result = await fetch("/api/member/plan", { method: "POST" });
    setMessage(
      result.ok
        ? "Plan registration created. Pay the ₹1,000 due before its deadline."
        : ((await result.json()).error ?? "Could not start plan registration"),
    );
    await load();
  };
  const handlePaymentStart = async (result: Response, walletSuccessMessage: string) => {
    const data = (await result.json()) as {
      checkout?: Checkout;
      error?: string;
      method?: string;
      status?: string;
    };
    if (result.ok && data.checkout) {
      try {
        await openGatewayCheckout(data.checkout);
        setMessage(
          "Gateway checkout opened. Your payment will be confirmed only after the verified provider webhook arrives.",
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Payment checkout is unavailable");
      }
      await load();
      return;
    }
    setMessage(
      result.ok
        ? paymentStartFeedback(data, walletSuccessMessage)
        : (data.error ?? "Payment could not be started"),
    );
    await load();
  };
  const pay = async (due: Due, method: "ONLINE" | "WALLET") => {
    const result = await fetch("/api/member/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dueId: due.externalId, method, idempotencyKey: key() }),
    });
    await handlePaymentStart(result, "Wallet payment settled and receipt issued.");
  };
  const resumePayment = async (paymentExternalId: string) => {
    const response = await fetch(
      `/api/member/payments/${encodeURIComponent(paymentExternalId)}/resume`,
      { method: "POST" },
    );
    await handlePaymentStart(response, "Wallet payment settled.");
  };
  const payContribution = async (method: "ONLINE" | "WALLET", eventExternalId?: string) => {
    const result = await fetch("/api/member/contributions/pay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        method,
        idempotencyKey: key(),
        ...(eventExternalId ? { eventExternalId } : {}),
      }),
    });
    await handlePaymentStart(
      result,
      eventExternalId
        ? "Selected contribution paid from wallet and receipt issued."
        : "Oldest outstanding contribution paid from wallet and receipt issued.",
    );
  };
  const reactivate = async () => {
    const result = await fetch("/api/member/membership/reactivate", { method: "POST" });
    setMessage(
      result.ok
        ? "Membership reactivated. Your existing Community Support Plan remains in place."
        : ((await result.json()).error ?? "Reactivation could not be completed"),
    );
    await load();
  };
  const cancelPayment = async (paymentExternalId: string) => {
    const result = await fetch(
      `/api/member/payments/${encodeURIComponent(paymentExternalId)}/cancel`,
      { method: "POST" },
    );
    const data = (await result.json()) as { error?: string };
    setMessage(
      result.ok
        ? "Payment request cancelled. No Foundation payment was recorded."
        : (data.error ?? "Payment could not be cancelled"),
    );
    await load();
  };
  const viewReceipt = async (receiptNumber: string) => {
    setSelectedReceipt(null);
    const result = await fetch(`/api/member/receipts/${encodeURIComponent(receiptNumber)}`);
    const receipt = (await result.json()) as ReceiptDetail & { error?: string };
    if (result.ok) setSelectedReceipt(receipt);
    setMessage(
      result.ok
        ? `Official receipt ${receipt.receiptNumber}: ${money(receipt.payment.amountPaise)} via ${receipt.payment.method}.`
        : (receipt.error ?? "Receipt not found"),
    );
  };
  const shareReceipt = async () => {
    if (!selectedReceipt) return;
    const text = [
      "Community Support Foundation — Official payment receipt",
      `Receipt: ${selectedReceipt.receiptNumber}`,
      `Member: ${selectedReceipt.payment.member?.fullName ?? "Member"}`,
      `Purpose: ${selectedReceipt.payment.due?.purpose ?? "Foundation payment"}`,
      `Amount: ${money(selectedReceipt.payment.amountPaise)}`,
      `Method: ${selectedReceipt.payment.method}`,
      `Status: ${selectedReceipt.payment.status}`,
      `Issued: ${new Date(selectedReceipt.issuedAt).toLocaleString()}`,
      `Reference: ${selectedReceipt.payment.externalId}`,
    ].join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: selectedReceipt.receiptNumber, text });
        setMessage("Receipt share sheet opened.");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setMessage("Receipt details copied. You can now paste them into a message.");
      } else {
        setMessage("Sharing is unavailable in this browser. Download the receipt instead.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Receipt sharing could not be completed.");
    }
  };
  return (
    <main aria-busy={busy}>
      <fieldset className="portal-content" disabled={busy} aria-label="Member services">
        <p className="eyebrow">MEMBER PORTAL</p>
        <h1>{pageCopy[section]?.[0] ?? "Member services"}</h1>
        <p className="page-description">
          {pageCopy[section]?.[1] ?? "Manage your Foundation membership securely."}
        </p>
        {loading && <p role="status">Loading your private records…</p>}
        {message && (
          <p className="feedback-message" role="status">
            {message}
          </p>
        )}
        {loadErrors.length > 0 && (
          <p>
            <button
              onClick={() =>
                void runAction(async () => {
                  setMessage("");
                  await load();
                })
              }
            >
              Retry loading records
            </button>{" "}
            <Link href="/login">Sign in again</Link>
          </p>
        )}
        {section === "dashboard" && <MemberProfile summary />}
        {section === "dashboard" && (
          <div className="grid member-quick-links">
            <Link href="/member/dues">
              <span>Outstanding obligations</span>
              <strong>
                {loading ? "…" : loadErrors.includes("dues") ? "Unavailable" : dues.length}
              </strong>
              <small>View dues & payment options →</small>
            </Link>
            <Link href="/member/wallet">
              <span>Foundation Wallet</span>
              <strong>{loading ? "…" : wallet === null ? "Unavailable" : money(wallet)}</strong>
              <small>View balance & activity →</small>
            </Link>
            <Link href="/member/payments-receipts">
              <span>Official receipts</span>
              <strong>
                {loading ? "…" : loadErrors.includes("receipts") ? "Unavailable" : receipts.length}
              </strong>
              <small>View payments & receipts →</small>
            </Link>
          </div>
        )}
        {(section === "membership" || section === "dashboard") && (
          <article>
            <h2>Membership</h2>
            <p>
              Status:{" "}
              <strong>{membership?.status ?? (loading ? "Loading…" : "Unavailable")}</strong>
            </p>
            <button
              onClick={() =>
                void runAction(async () => {
                  const response = await fetch("/api/member/membership/refresh", {
                    method: "POST",
                  });
                  setMessage(
                    response.ok
                      ? "Membership renewal and status checked."
                      : "Could not refresh membership.",
                  );
                  await load();
                })
              }
            >
              Check renewal and status
            </button>
            {membership?.status === "INACTIVE" && (
              <button onClick={() => void runAction(reactivate)}>
                Reactivate after settling dues
              </button>
            )}
            {membership?.status === "CLOSED" && (
              <p>
                A closed membership requires a new Community Support Plan registration when
                reopened.
              </p>
            )}
          </article>
        )}
        {(section === "community-support-plan" || section === "dashboard") && (
          <article>
            <h2>Community Support Plan</h2>
            <p>
              Status: <strong>{plan?.status ?? (loading ? "Loading…" : "Unavailable")}</strong>
            </p>
            {plan?.waitingEndsAt && (
              <p>
                Initial waiting period ends: {new Date(plan.waitingEndsAt).toLocaleDateString()}
              </p>
            )}
            {plan?.feeExempt && (
              <p>
                Coordinators are exempt from the ₹369 membership and ₹1,000 plan fees. ₹100 event
                contributions still apply.
              </p>
            )}
            {plan?.status === "NOT_REGISTERED" && !plan.feeExempt && (
              <button onClick={() => void runAction(startPlan)}>Start ₹1,000 registration</button>
            )}
          </article>
        )}
        {(section === "notifications" ||
          section === "community-news" ||
          section === "dashboard") && <MemberCommunications />}
        {(section === "payments-receipts" ||
          section === "dues" ||
          section === "community-support-plan") && (
          <>
            <article>
              <h2>Payable dues</h2>
              {dues.some((due) => due.purpose === "CONTRIBUTION") && (
                <section aria-label="Contribution payment options">
                  <h3>₹100 contribution payment</h3>
                  <p>FIFO payment settles your oldest outstanding contribution first.</p>
                  <button onClick={() => void runAction(() => payContribution("WALLET"))}>
                    Pay oldest from wallet
                  </button>
                  <button onClick={() => void runAction(() => payContribution("ONLINE"))}>
                    Pay oldest online
                  </button>
                </section>
              )}
              {dues.length ? (
                dues.map((due) => (
                  <div key={due.externalId}>
                    <strong>{paymentPurposeLabel(due.purpose)}</strong> — {money(due.amountPaise)}{" "}
                    due {new Date(due.dueAt).toLocaleDateString()}{" "}
                    {due.purpose === "CONTRIBUTION" ? (
                      due.contributionEventExternalId ? (
                        <>
                          <p>
                            Death Support Event: <code>{due.contributionEventExternalId}</code>
                          </p>
                          <button
                            onClick={() =>
                              runAction(() =>
                                payContribution(
                                  "WALLET",
                                  due.contributionEventExternalId ?? undefined,
                                ),
                              )
                            }
                          >
                            Pay this event from wallet
                          </button>
                          <button
                            onClick={() =>
                              runAction(() =>
                                payContribution(
                                  "ONLINE",
                                  due.contributionEventExternalId ?? undefined,
                                ),
                              )
                            }
                          >
                            Pay this event online
                          </button>
                        </>
                      ) : (
                        <p>Event details are unavailable. You can still use FIFO payment above.</p>
                      )
                    ) : (
                      <>
                        <button onClick={() => void runAction(() => pay(due, "WALLET"))}>
                          Pay from wallet
                        </button>
                        <button onClick={() => void runAction(() => pay(due, "ONLINE"))}>
                          Pay online
                        </button>
                      </>
                    )}
                  </div>
                ))
              ) : (
                <p>
                  {loading
                    ? "Loading dues…"
                    : loadErrors.includes("dues")
                      ? "Dues are unavailable. Retry loading records."
                      : "No payable dues."}
                </p>
              )}
            </article>
            <article>
              <h2>Receipts</h2>
              {receipts.length ? (
                receipts.map((receipt) => (
                  <p key={receipt.receiptNumber}>
                    {receipt.receiptNumber} · {new Date(receipt.issuedAt).toLocaleDateString()}
                    <button
                      onClick={() => void runAction(() => viewReceipt(receipt.receiptNumber))}
                    >
                      View receipt
                    </button>
                  </p>
                ))
              ) : (
                <p>
                  {loading
                    ? "Loading receipts…"
                    : loadErrors.includes("receipts")
                      ? "Receipts are unavailable. Retry loading records."
                      : "No receipts yet."}
                </p>
              )}
            </article>
            {selectedReceipt && (
              <article aria-label="Official payment receipt">
                <h2>Official receipt</h2>
                <p>
                  <strong>{selectedReceipt.receiptNumber}</strong>
                </p>
                <p>Issued: {new Date(selectedReceipt.issuedAt).toLocaleString()}</p>
                <p>Member: {selectedReceipt.payment.member?.fullName ?? "Member"}</p>
                <p>
                  Member ID: <code>{selectedReceipt.payment.member?.externalId ?? "—"}</code>
                </p>
                <p>
                  {selectedReceipt.payment.due?.purpose ?? "Foundation payment"} ·{" "}
                  {money(selectedReceipt.payment.amountPaise)} · {selectedReceipt.payment.method}
                </p>
                <p>
                  Payment reference: <code>{selectedReceipt.payment.externalId}</code>
                </p>
                {selectedReceipt.payment.providerReference && (
                  <p>
                    Provider reference: <code>{selectedReceipt.payment.providerReference}</code>
                  </p>
                )}
                <p>
                  <a
                    href={`/api/member/receipts/${encodeURIComponent(selectedReceipt.receiptNumber)}/download`}
                    download
                  >
                    Download receipt
                  </a>{" "}
                  <button onClick={shareReceipt}>Share receipt</button>
                </p>
              </article>
            )}
          </>
        )}
        {(section === "wallet" || section === "dashboard") && (
          <article>
            <h2>Foundation Wallet</h2>
            <p>
              Available balance:{" "}
              <strong>
                {loading ? "Loading…" : wallet === null ? "Unavailable" : money(wallet)}
              </strong>
            </p>
            <p>
              Wallet credit is issued only by the Foundation and is automatically available for
              eligible payments.
            </p>
            <h3>Recent wallet activity</h3>
            {walletActivity.length ? (
              <div aria-label="Recent wallet activity">
                {walletActivity.map((activity, index) => (
                  <p
                    key={`${activity.createdAt}-${activity.direction}-${activity.amountPaise}-${activity.balanceAfterPaise}-${index}`}
                  >
                    <strong>{activity.direction === "CREDIT" ? "Credit" : "Payment"}</strong> ·{" "}
                    {activity.category} · {money(activity.amountPaise)} · Balance{" "}
                    {money(activity.balanceAfterPaise)} ·{" "}
                    {new Date(activity.createdAt).toLocaleDateString()}
                  </p>
                ))}
              </div>
            ) : (
              <p>
                {loading
                  ? "Loading wallet activity…"
                  : loadErrors.includes("activity")
                    ? "Wallet activity is unavailable. Retry loading records."
                    : "No wallet activity yet."}
              </p>
            )}
          </article>
        )}
        <article>
          <h2>Recent payments</h2>
          {payments.length ? (
            payments.map((payment) => (
              <p key={payment.externalId}>
                {payment.method} · {money(payment.amountPaise)} · {payment.status}
                {payment.canCancel && (
                  <button onClick={() => void runAction(() => cancelPayment(payment.externalId))}>
                    Cancel payment
                  </button>
                )}
                {payment.canResume && (
                  <button onClick={() => void runAction(() => resumePayment(payment.externalId))}>
                    Resume checkout
                  </button>
                )}
              </p>
            ))
          ) : (
            <p>
              {loading
                ? "Loading payments…"
                : loadErrors.includes("payments")
                  ? "Payments are unavailable. Retry loading records."
                  : "No payments yet."}
            </p>
          )}
        </article>
      </fieldset>
    </main>
  );
}
