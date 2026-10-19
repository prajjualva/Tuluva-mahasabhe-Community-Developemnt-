"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Collection = {
  externalId: string;
  receiptNumber: string;
  outstandingAmountPaise: number;
  status: string;
  awaitingDepositReview: boolean;
  discrepancy: null | {
    status: string;
    amountPaise: number;
    deadlineAt: string;
    escalatedAt: string | null;
  };
};
type Deposit = {
  externalId: string;
  bankReference: string;
  amountPaise: number;
  status: string;
  allocations: {
    expectedAmountPaise: number;
    receivedAmountPaise: number | null;
    collection: { externalId: string; receiptNumber: string };
  }[];
};
type Overview = { collections: Collection[]; deposits: Deposit[] };
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);

function DepositReview({
  deposit,
  onComplete,
}: {
  deposit: Deposit;
  onComplete: (message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const approved = form.get("decision") === "verify";
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/cash-deposits/${deposit.externalId}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approved,
          reason: form.get("reason"),
          allocations: deposit.allocations.map((item) => ({
            collectionExternalId: item.collection.externalId,
            receivedRupees: approved ? form.get(item.collection.externalId) : "0",
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not verify deposit");
      await onComplete(
        approved
          ? "Deposit reviewed. Covered payments are paid; shortfalls are recorded."
          : "Deposit rejected. Outstanding collections remain due for reconciliation.",
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <p>Enter the amount actually received for each receipt. Leave uncovered receipts at zero.</p>
      {deposit.allocations.map((item) => (
        <label key={item.collection.externalId}>
          {item.collection.receiptNumber} · outstanding {money(item.expectedAmountPaise)}
          <input
            name={item.collection.externalId}
            inputMode="decimal"
            defaultValue="0"
            required
            aria-label={`Received rupees for ${item.collection.receiptNumber}`}
          />
        </label>
      ))}
      <label>
        Decision
        <select name="decision">
          <option value="verify">Verify received money</option>
          <option value="reject">Reject evidence; no money verified</option>
        </select>
      </label>
      <label>
        Verification / rejection reason
        <textarea name="reason" required minLength={3} maxLength={1000} />
      </label>
      <button disabled={busy}>{busy ? "Saving…" : "Record reconciliation"}</button>
      <p role="alert">{error}</p>
    </form>
  );
}

export function CashReconciliation({ admin = false }: { admin?: boolean }) {
  const [data, setData] = useState<Overview>({ collections: [], deposits: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState("");
  const endpoint = admin ? "/api/admin/cash-deposits" : "/api/member/cash-remittances";
  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load remittances");
      setData(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load remittances");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);
  useEffect(() => {
    setKey(crypto.randomUUID());
    void load();
    const refresh = () => {
      void load();
    };
    window.addEventListener("cash-collection-recorded", refresh);
    return () => window.removeEventListener("cash-collection-recorded", refresh);
  }, [load]);
  const onComplete = async (text: string) => {
    setMessage(text);
    await load();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const upload = new FormData();
    upload.set(
      "command",
      JSON.stringify({
        collectionExternalIds: form.getAll("collection"),
        amountRupees: form.get("amount"),
        bankReference: form.get("reference"),
        idempotencyKey: key,
      }),
    );
    upload.set("evidence", form.get("evidence")!);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", body: upload });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not submit deposit");
      setKey(crypto.randomUUID());
      formElement.reset();
      await onComplete(
        "Remittance evidence submitted. Each member keeps their own collection receipt.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Submission failed. Retry with the same details.",
      );
    } finally {
      setBusy(false);
    }
  };
  const open = data.collections.filter((item) =>
    ["RECEIVED_BY_COORDINATOR", "PENDING_ADMIN_VERIFICATION"].includes(item.status),
  );
  return (
    <article>
      <h2>{admin ? "Cash deposits and reconciliation" : "My cash remittances"}</h2>
      <p>
        Collections remain pending until Foundation Admin verifies the remittance. Shortfalls must
        be resolved within 30 days.
      </p>
      <p role="status">{loading ? "Loading remittances…" : message}</p>
      <button type="button" disabled={busy || loading} onClick={() => void load()}>
        Refresh remittances
      </button>
      {!admin && (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <legend>Submit Foundation deposit evidence</legend>
            {open
              .filter((item) => !item.awaitingDepositReview)
              .map((item) => (
                <label key={item.externalId}>
                  <input type="checkbox" name="collection" value={item.externalId} />
                  {item.receiptNumber} · {money(item.outstandingAmountPaise)} outstanding
                </label>
              ))}
            <label>
              Amount deposited (₹)
              <input name="amount" inputMode="decimal" required />
            </label>
            <label>
              Bank deposit / transfer reference
              <input name="reference" required minLength={3} maxLength={120} />
            </label>
            <label>
              Deposit receipt (PDF, PNG, JPEG; up to 5 MB)
              <input
                type="file"
                name="evidence"
                accept="application/pdf,image/png,image/jpeg"
                required
              />
            </label>
            <button disabled={!open.some((item) => !item.awaitingDepositReview) || !key}>
              {busy ? "Submitting…" : "Submit remittance"}
            </button>
          </fieldset>
        </form>
      )}
      <h3>Outstanding collections</h3>
      {!open.length && <p>No outstanding collections.</p>}
      {open.map((item) => (
        <section key={item.externalId}>
          <strong>{item.receiptNumber}</strong>
          <p>
            {money(item.outstandingAmountPaise)} ·{" "}
            {item.awaitingDepositReview ? "Evidence awaiting review" : "Remittance needed"}
          </p>
          {item.discrepancy?.status === "UNRESOLVED" && (
            <p role="status">
              Shortfall {money(item.discrepancy.amountPaise)}. Resolve by{" "}
              {new Date(item.discrepancy.deadlineAt).toLocaleDateString("en-IN")}.
              {item.discrepancy.escalatedAt ? " Escalated for Admin investigation." : ""}
            </p>
          )}
        </section>
      ))}
      <h3>Submitted deposits</h3>
      {!data.deposits.length && <p>No deposits submitted.</p>}
      {data.deposits.map((deposit) => (
        <section key={deposit.externalId}>
          <strong>{deposit.bankReference}</strong>
          <p>
            {money(deposit.amountPaise)} · {deposit.status}
          </p>
          <p>Deposit reference: {deposit.externalId}</p>
          <a href={`${endpoint}/${deposit.externalId}/evidence`}>Download remittance evidence</a>
          {admin && deposit.status === "PENDING" ? (
            <DepositReview deposit={deposit} onComplete={onComplete} />
          ) : (
            <ul>
              {deposit.allocations.map((item) => (
                <li key={item.collection.externalId}>
                  {item.collection.receiptNumber} ·{" "}
                  {item.receivedAmountPaise === null
                    ? "Awaiting verification"
                    : `${money(item.receivedAmountPaise)} verified`}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
