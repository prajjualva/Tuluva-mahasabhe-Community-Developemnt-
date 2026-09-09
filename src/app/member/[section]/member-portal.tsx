"use client";
import { useEffect, useState } from "react";

type Due = {
  externalId: string;
  purpose: string;
  amountPaise: number;
  dueAt: string;
  status: string;
};
type Plan = { externalId?: string; status: string; activatedAt?: string; waitingEndsAt?: string };
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
  const [plan, setPlan] = useState<Plan | null>(null);
  const [dues, setDues] = useState<Due[]>([]);
  const [wallet, setWallet] = useState<number>(0);
  const [walletActivity, setWalletActivity] = useState<WalletActivity[]>([]);
  const [payments, setPayments] = useState<
    Array<{ externalId: string; amountPaise: number; status: string; method: string }>
  >([]);
  const [receipts, setReceipts] = useState<Array<{ receiptNumber: string; issuedAt: string }>>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [message, setMessage] = useState("");
  const load = async () => {
    const [
      planResult,
      dueResult,
      walletResult,
      walletActivityResult,
      paymentResult,
      receiptResult,
      membershipResult,
    ] = await Promise.all([
      fetch("/api/member/plan/status"),
      fetch("/api/member/dues"),
      fetch("/api/member/wallet"),
      fetch("/api/member/wallet/activity?limit=20"),
      fetch("/api/member/payments/history"),
      fetch("/api/member/receipts"),
      fetch("/api/member/membership/status"),
    ]);
    if (planResult.ok) setPlan(await planResult.json());
    if (dueResult.ok) setDues(await dueResult.json());
    if (walletResult.ok) setWallet((await walletResult.json()).balancePaise);
    if (walletActivityResult.ok) {
      const activityResponse = (await walletActivityResult.json()) as {
        activity: WalletActivity[];
      };
      setWalletActivity(activityResponse.activity);
    }
    if (paymentResult.ok) setPayments(await paymentResult.json());
    if (receiptResult.ok) setReceipts(await receiptResult.json());
    if (membershipResult.ok) setMembership(await membershipResult.json());
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
  const pay = async (due: Due, method: "ONLINE" | "WALLET") => {
    const result = await fetch("/api/member/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dueId: due.externalId, method, idempotencyKey: key() }),
    });
    const data = await result.json();
    if (result.ok && data.checkout) {
      try {
        await openGatewayCheckout(data.checkout as Checkout);
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
        ? method === "WALLET"
          ? "Wallet payment settled and receipt issued."
          : "Online payment is awaiting the configured payment provider."
        : (data.error ?? "Payment could not be started"),
    );
    await load();
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
  const viewReceipt = async (receiptNumber: string) => {
    const result = await fetch(`/api/member/receipts/${encodeURIComponent(receiptNumber)}`);
    const receipt = await result.json();
    setMessage(
      result.ok
        ? `Official receipt ${receipt.receiptNumber}: ${money(receipt.payment.amountPaise)} via ${receipt.payment.method}.`
        : (receipt.error ?? "Receipt not found"),
    );
  };
  return (
    <main>
      <p className="eyebrow">MEMBER PORTAL</p>
      <h1>{section.replaceAll("-", " ")}</h1>
      <p>{message}</p>
      {(section === "membership" || section === "dashboard") && (
        <article>
          <h2>Membership</h2>
          <p>
            Status: <strong>{membership?.status ?? "Loading"}</strong>
          </p>
          {membership?.status === "INACTIVE" && (
            <button onClick={reactivate}>Reactivate after settling dues</button>
          )}
          {membership?.status === "CLOSED" && (
            <p>
              A closed membership requires a new Community Support Plan registration when reopened.
            </p>
          )}
        </article>
      )}
      {(section === "community-support-plan" || section === "dashboard") && (
        <article>
          <h2>Community Support Plan</h2>
          <p>
            Status: <strong>{plan?.status ?? "Loading"}</strong>
          </p>
          {plan?.waitingEndsAt && (
            <p>Initial waiting period ends: {new Date(plan.waitingEndsAt).toLocaleDateString()}</p>
          )}
          {plan?.status === "NOT_REGISTERED" && (
            <button onClick={startPlan}>Start ₹1,000 registration</button>
          )}
        </article>
      )}
      {(section === "payments-receipts" ||
        section === "community-support-plan" ||
        section === "dashboard") && (
        <>
          <article>
            <h2>Payable dues</h2>
            {dues.length ? (
              dues.map((due) => (
                <div key={due.externalId}>
                  <strong>{due.purpose}</strong> — {money(due.amountPaise)} due{" "}
                  {new Date(due.dueAt).toLocaleDateString()}{" "}
                  <button onClick={() => pay(due, "WALLET")}>Pay from wallet</button>
                  <button onClick={() => pay(due, "ONLINE")}>Pay online</button>
                </div>
              ))
            ) : (
              <p>No payable dues.</p>
            )}
          </article>
          <article>
            <h2>Receipts</h2>
            {receipts.length ? (
              receipts.map((receipt) => (
                <p key={receipt.receiptNumber}>
                  {receipt.receiptNumber} · {new Date(receipt.issuedAt).toLocaleDateString()}
                  <button onClick={() => viewReceipt(receipt.receiptNumber)}>View receipt</button>
                </p>
              ))
            ) : (
              <p>No receipts yet.</p>
            )}
          </article>
        </>
      )}
      {(section === "wallet" || section === "dashboard") && (
        <article>
          <h2>Foundation Wallet</h2>
          <p>
            Available balance: <strong>{money(wallet)}</strong>
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
            <p>No wallet activity yet.</p>
          )}
        </article>
      )}
      <article>
        <h2>Recent payments</h2>
        {payments.length ? (
          payments.map((payment) => (
            <p key={payment.externalId}>
              {payment.method} · {money(payment.amountPaise)} · {payment.status}
            </p>
          ))
        ) : (
          <p>No payments yet.</p>
        )}
      </article>
    </main>
  );
}
