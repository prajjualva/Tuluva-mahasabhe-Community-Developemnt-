"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { paymentPurposeLabel } from "../member/payment-feedback";

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
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const requestSequence = useRef(0);
  const commandLock = useRef(false);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setUnavailable(false);
    setPayments([]);
    setTotal(0);
    try {
      const query = new URLSearchParams({ search, page: String(page) });
      if (status) query.set("status", status);
      const response = await fetch(`/api/admin/payments?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Payment records unavailable");
      const records = (await response.json()) as Payment[];
      if (sequence !== requestSequence.current) return;
      setPayments(records);
      setTotal(Number(response.headers.get("x-total-count") ?? 0));
    } catch {
      if (sequence === requestSequence.current) setUnavailable(true);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [search, page, status]);
  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);
  const filter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus(String(form.get("status") ?? ""));
    setSearch(String(form.get("search") ?? ""));
    setPage(1);
  };

  const requestRefund = async (payment: Payment) => {
    if (commandLock.current || loading || unavailable) return;
    const reason = window.prompt("Reason for the full refund (recorded in the audit log)");
    if (!reason) return;
    commandLock.current = true;
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
      commandLock.current = false;
      setBusy(false);
    }
  };

  const settleManual = async (refund: Refund) => {
    if (commandLock.current || loading || unavailable) return;
    const reference = window.prompt("Cash/manual refund reference or voucher number");
    if (!reference) return;
    commandLock.current = true;
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
      commandLock.current = false;
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
      <p role="status">{message}</p>
      {loading ? (
        <p>Loading payment records…</p>
      ) : unavailable ? (
        <p role="status">
          Payment records are unavailable. Check your connection or sign in again.{" "}
          <button disabled={busy} onClick={() => void load()}>
            Retry loading payments
          </button>
        </p>
      ) : payments.length ? (
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
              {paymentPurposeLabel(payment.purpose)} · {payment.method} · ₹
              {(payment.amountPaise / 100).toFixed(2)} · {payment.status}
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
      {!loading && !unavailable && (
        <p>
          {total} matching records · Page {page}
        </p>
      )}
      <button
        disabled={busy || loading || unavailable || page === 1}
        onClick={() => setPage((value) => value - 1)}
      >
        Previous payments
      </button>
      <button
        disabled={busy || loading || unavailable || page * 50 >= total}
        onClick={() => setPage((value) => value + 1)}
      >
        Next payments
      </button>
    </article>
  );
}
