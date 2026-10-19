"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Entry = {
  externalId: string;
  amountPaise: number;
  direction: string;
  purpose: string;
  relatedExternalId: string | null;
  createdAt: string;
  reference: string;
  status: string;
  actor: { externalId: string; name: string } | null;
  supportingDocumentUrl: string;
};
type Adjustment = {
  externalId: string;
  amountPaise: number;
  purpose: string;
  reference: string;
  reason: string;
  status: string;
};
type Ledger = {
  total: number;
  entries: Entry[];
  totals: { direction: string; amountPaise: number }[];
  adjustments: Adjustment[];
};
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);
export function AdminFoundationLedger() {
  const [data, setData] = useState<Ledger>({ total: 0, entries: [], totals: [], adjustments: [] });
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/ledger?page=${page}&purpose=${encodeURIComponent(filter)}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Cannot load ledger");
      setData(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cannot load ledger");
    }
  }, [page, filter]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setKey(crypto.randomUUID());
  }, []);
  const requestAdjustment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const payload = new FormData();
    payload.set("evidence", form.get("evidence")!);
    payload.set(
      "command",
      JSON.stringify({
        amountRupees: form.get("amount"),
        purpose: form.get("purpose"),
        reference: form.get("reference"),
        reason: form.get("reason"),
        idempotencyKey: key,
      }),
    );
    setBusy(true);
    try {
      const response = await fetch("/api/admin/ledger-adjustments", {
        method: "POST",
        body: payload,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Cannot request adjustment");
      setKey(crypto.randomUUID());
      element.reset();
      setMessage(
        "Adjustment submitted for explicit approval. No ledger debit has been posted yet.",
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  const decide = async (event: FormEvent<HTMLFormElement>, adjustmentId: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/ledger-adjustments/${adjustmentId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approved: form.get("decision") === "approve",
          reason: form.get("reason"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Decision denied");
      setMessage("Decision recorded with Admin identity, timestamp and audit.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article>
      <h2>Foundation Ledger</h2>
      <p role="status">{message}</p>
      <div className="grid">
        {data.totals.map((total) => (
          <section key={total.direction}>
            <strong>{total.direction}</strong>
            <p>{money(total.amountPaise)}</p>
          </section>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setFilter(String(new FormData(event.currentTarget).get("search") ?? ""));
        }}
      >
        <label>
          Filter by purpose
          <input name="search" maxLength={200} />
        </label>
        <button>Search ledger</button>
      </form>
      <div className="table-scroll">
        <table>
          <caption>Settled and pending Foundation movements</caption>
          <thead>
            <tr>
              <th>When / actor</th>
              <th>Purpose / reference</th>
              <th>Movement</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry) => (
              <tr key={entry.externalId}>
                <td>
                  {new Date(entry.createdAt).toLocaleString("en-IN")}
                  <br />
                  {entry.actor?.name ?? "System"}
                  <br />
                  {entry.actor?.externalId}
                </td>
                <td>
                  {entry.purpose}
                  <br />
                  {entry.reference}
                  <br />
                  {entry.relatedExternalId}
                </td>
                <td>
                  {entry.direction} {money(entry.amountPaise)}
                  <br />
                  {entry.status}
                </td>
                <td>
                  <a href={entry.supportingDocumentUrl}>Supporting document</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.entries.length && <p>No ledger entries match this search.</p>}
      <button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
        Previous
      </button>
      <span>
        {" "}
        Page {page} · {data.total} entries{" "}
      </span>
      <button disabled={page * 50 >= data.total} onClick={() => setPage((value) => value + 1)}>
        Next
      </button>
      <details>
        <summary>Request an operational debit adjustment</summary>
        <form onSubmit={requestAdjustment}>
          <fieldset disabled={busy}>
            <label>
              Amount (₹)
              <input name="amount" inputMode="decimal" required />
            </label>
            <label>
              Purpose
              <input name="purpose" minLength={3} maxLength={200} required />
            </label>
            <label>
              Unique reference
              <input name="reference" minLength={3} maxLength={120} required />
            </label>
            <label>
              Reason
              <textarea name="reason" minLength={3} maxLength={1000} required />
            </label>
            <label>
              Supporting document
              <input
                type="file"
                name="evidence"
                accept="application/pdf,image/png,image/jpeg"
                required
              />
            </label>
            <button disabled={!key}>Submit adjustment request</button>
          </fieldset>
        </form>
      </details>
      <h3>Operational adjustments</h3>
      {data.adjustments.map((item) => (
        <section key={item.externalId}>
          <strong>
            {item.reference} · {money(item.amountPaise)} · {item.status}
          </strong>
          <p>
            {item.purpose} · {item.reason}
          </p>
          <a href={`/api/admin/ledger-adjustments/${item.externalId}/document`}>
            Review supporting document
          </a>
          {item.status === "PENDING" && (
            <form onSubmit={(event) => void decide(event, item.externalId)}>
              <label>
                Decision
                <select name="decision">
                  <option value="approve">Approve debit</option>
                  <option value="reject">Reject</option>
                </select>
              </label>
              <label>
                Decision reason
                <textarea name="reason" minLength={3} maxLength={1000} required />
              </label>
              <button disabled={busy}>Record decision</button>
            </form>
          )}
        </section>
      ))}
    </article>
  );
}
