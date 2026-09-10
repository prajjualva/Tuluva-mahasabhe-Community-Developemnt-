"use client";

import { useEffect, useState } from "react";

type Refund = {
  externalId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  reason: string;
  providerReference: string | null;
  createdAt: string;
  completedAt: string | null;
};
type Payment = {
  externalId: string;
  amountPaise: number;
  method: "ONLINE" | "WALLET" | "CASH" | "MANUAL";
  createdAt: string;
  member: { externalId: string; fullName: string } | null;
  purpose: string;
  status: "SUCCEEDED" | "REFUNDED";
  refund: Refund | null;
};

export function AdminPaymentRefunds() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [message, setMessage] = useState("");
  const load = async () => {
    const response = await fetch("/api/admin/payments");
    if (response.ok) setPayments(await response.json());
    else setMessage("Sign in as an Administrator to review payment refunds.");
  };
  useEffect(() => {
    void load();
  }, []);

  const requestRefund = async (payment: Payment) => {
    const reason = window.prompt("Reason for the full refund (recorded in the audit log)");
    if (!reason) return;
    const response = await fetch(`/api/admin/payments/${payment.externalId}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason, idempotencyKey: crypto.randomUUID() }),
    });
    const data = (await response.json()) as { error?: string; outcome?: string };
    setMessage(
      response.ok
        ? data.outcome === "SUCCEEDED"
          ? "Refund settled and compensating ledger entries were recorded."
          : data.outcome === "MANUAL_ACTION_REQUIRED"
            ? "Refund request recorded. Issue the cash/manual refund, then record its reference below."
            : data.outcome === "PROVIDER_UNAVAILABLE"
              ? "Refund request is safely pending until the online payment provider is configured."
              : "Refund request recorded and awaiting provider confirmation."
        : (data.error ?? "Refund request was denied."),
    );
    await load();
  };

  const settleManual = async (refund: Refund) => {
    const reference = window.prompt("Cash/manual refund reference or voucher number");
    if (!reference) return;
    const response = await fetch(`/api/admin/refunds/${refund.externalId}/settle-manual`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference }),
    });
    const data = (await response.json()) as { error?: string };
    setMessage(
      response.ok
        ? "Manual refund recorded with its reference and compensating ledger entry."
        : (data.error ?? "Manual refund could not be recorded."),
    );
    await load();
  };

  return (
    <article>
      <h2>Payment refunds</h2>
      <p>
        Refunds are full-payment, audited compensating entries; they do not overwrite the original
        payment or receipt.
      </p>
      <p>{message}</p>
      {payments.length ? (
        payments.map((payment) => (
          <section key={payment.externalId}>
            <strong>{payment.member?.fullName ?? "Member"}</strong>
            <p>
              {payment.purpose} · {payment.method} · ₹{(payment.amountPaise / 100).toFixed(2)} ·{" "}
              {payment.status}
            </p>
            <p>
              Member ID: <code>{payment.member?.externalId ?? "—"}</code>
            </p>
            {!payment.refund && (
              <button onClick={() => requestRefund(payment)}>Request full refund</button>
            )}
            {payment.refund && (
              <p>
                Refund {payment.refund.status} · {payment.refund.reason}
                {payment.refund.providerReference ? ` · ${payment.refund.providerReference}` : ""}
              </p>
            )}
            {payment.refund &&
              payment.refund.status === "PENDING" &&
              payment.method === "ONLINE" && (
                <button onClick={() => requestRefund(payment)}>Retry online refund</button>
              )}
            {payment.refund &&
              payment.refund.status === "PENDING" &&
              (payment.method === "CASH" || payment.method === "MANUAL") && (
                <button onClick={() => settleManual(payment.refund!)}>
                  Record issued cash/manual refund
                </button>
              )}
          </section>
        ))
      ) : (
        <p>No successful payments are available for refund review.</p>
      )}
    </article>
  );
}
