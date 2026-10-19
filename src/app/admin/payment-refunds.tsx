"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Refund = {
  externalId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  reason: string;
  providerReference: string | null;
  createdAt: string;
  completedAt: string | null;
};
type Payment = {
  requiresRefundReview?: boolean;
  externalId: string;
  amountPaise: number;
  method: "ONLINE" | "WALLET" | "CASH" | "MANUAL";
  createdAt: string;
  member: { externalId: string; fullName: string } | null;
  purpose: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "REFUNDED";
  receipt: { receiptNumber: string } | null;
  refund: Refund | null;
};

export function AdminPaymentRefunds() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ search, page: String(page) });
      if (status) query.set("status", status);
      const response = await fetch(`/api/admin/payments?${query}`);
      if (response.ok) setPayments(await response.json());
      else setMessage("Sign in as an Administrator to review payment refunds.");
      setTotal(Number(response.headers.get("x-total-count") ?? 0));
    } catch {
      setMessage("Payment records could not be loaded. Check your connection and retry.");
    }
  }, [search, page, status]);
  useEffect(() => {
    void load();
  }, [load]);
  const filter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus(String(form.get("status") ?? ""));
    setSearch(String(form.get("search") ?? ""));
    setPage(1);
  };

  const requestRefund = async (payment: Payment) => {
    const reason = window.prompt("Reason for the full refund (recorded in the audit log)");
    if (!reason) return;
    if (busy) return;
    setBusy(true);
    try {
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
    } catch {
      setMessage(
        "Refund confirmation could not be loaded. Review payment history before retrying.",
      );
    } finally {
      setBusy(false);
    }
  };

  const settleManual = async (refund: Refund) => {
    const reference = window.prompt("Cash/manual refund reference or voucher number");
    if (!reference) return;
    if (busy) return;
    setBusy(true);
    try {
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
    } catch {
      setMessage("Could not record the outcome. Review the existing refund before retrying.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article>
      <h2>Payments & refunds</h2>
      <p>
        Refunds are full-payment, audited compensating entries; they do not overwrite the original
        payment or receipt.
      </p>
      <form onSubmit={filter}>
        <label>
          Find payment or member
          <input
            name="search"
            defaultValue={search}
            placeholder="Member name, member/payment UUID, or provider reference"
          />
        </label>
        <label>
          Payment status
          <select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {["PENDING", "SUCCEEDED", "FAILED", "CANCELLED", "REFUNDED"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button disabled={busy}>Filter payment records</button>
      </form>
      <p>{message}</p>
      {payments.length ? (
        payments.map((payment) => (
          <section key={payment.externalId}>
            <strong>{payment.member?.fullName ?? "Member"}</strong>
            {payment.requiresRefundReview && (
              <p role="alert">
                Captured funds were not applied to the due. Review and arrange a refund; no
                membership or plan was activated.
              </p>
            )}
            <p>
              {payment.purpose} · {payment.method} · ₹{(payment.amountPaise / 100).toFixed(2)} ·{" "}
              {payment.status}
            </p>
            <p>
              Member ID: <code>{payment.member?.externalId ?? "—"}</code>
            </p>
            <p>
              Payment reference: <code>{payment.externalId}</code>
            </p>
            {payment.receipt && (
              <p>
                <a
                  href={`/api/admin/receipts/${encodeURIComponent(payment.receipt.receiptNumber)}/download`}
                >
                  Download receipt {payment.receipt.receiptNumber}
                </a>
              </p>
            )}
            {payment.status === "SUCCEEDED" && !payment.refund && (
              <button disabled={busy} onClick={() => requestRefund(payment)}>
                Request full refund
              </button>
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
                <button disabled={busy} onClick={() => requestRefund(payment)}>
                  Retry online refund
                </button>
              )}
            {payment.refund &&
              payment.refund.status === "PENDING" &&
              (payment.method === "CASH" || payment.method === "MANUAL") && (
                <button disabled={busy} onClick={() => settleManual(payment.refund!)}>
                  Record issued cash/manual refund
                </button>
              )}
          </section>
        ))
      ) : (
        <p>No payments match these filters.</p>
      )}
      <p>
        {total} matching records · Page {page}
      </p>
      <button disabled={busy || page === 1} onClick={() => setPage((value) => value - 1)}>
        Previous payments
      </button>
      <button disabled={busy || page * 50 >= total} onClick={() => setPage((value) => value + 1)}>
        Next payments
      </button>
    </article>
  );
}
