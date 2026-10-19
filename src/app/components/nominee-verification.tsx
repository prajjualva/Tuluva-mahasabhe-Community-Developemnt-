"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
type Nominee = {
  externalId: string;
  fullName: string;
  kind: string;
  relationship: string;
  status: string;
  member: { externalId: string; fullName: string };
  documents: { externalId: string; originalFilename: string }[];
};
type Bank = { accountHolderName: string; accountNumber: string; ifsc: string };
function Review({
  nominee,
  admin,
  done,
}: {
  nominee: Nominee;
  admin: boolean;
  done: () => Promise<void>;
}) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const endpoint = `/api/${admin ? "admin" : "coordinator"}/nominees/${nominee.externalId}`;
  const reviewBank = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(`${endpoint}/bank`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: new FormData(event.currentTarget).get("reason") }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Bank review denied");
      setBank(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bank review denied");
    } finally {
      setBusy(false);
    }
  };
  const decide = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch(`${endpoint}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approved: form.get("decision") === "approve",
          reason: form.get("reason"),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Verification denied");
      setBank(null);
      await done();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article>
      <h3>
        {nominee.member.fullName} — {nominee.fullName}
      </h3>
      <p>
        {nominee.kind} · {nominee.relationship}
      </p>
      {nominee.documents.map((document) => (
        <p key={document.externalId}>
          <a href={`${endpoint}/documents/${document.externalId}/download`}>
            {document.originalFilename}
          </a>
        </p>
      ))}
      {!nominee.documents.length && <p>Awaiting supporting evidence from the member.</p>}
      {admin ? (
        <form onSubmit={reviewBank}>
          <label>
            Reason for sensitive bank review
            <textarea name="reason" minLength={3} maxLength={1000} required />
          </label>
          <button disabled={busy}>Review bank details</button>
        </form>
      ) : (
        <p>Bank review requires an authorized Foundation reviewer before approval.</p>
      )}
      {bank && (
        <section aria-label="Restricted bank details">
          <p>{bank.accountHolderName}</p>
          <p>Account: {bank.accountNumber}</p>
          <p>IFSC: {bank.ifsc}</p>
          <button onClick={() => setBank(null)}>Hide bank details</button>
        </section>
      )}
      <form onSubmit={decide}>
        <label>
          Decision
          <select name="decision">
            <option value="approve">Approve verified nominee</option>
            <option value="reject">Reject submission</option>
          </select>
        </label>
        <label>
          Decision reason
          <textarea name="reason" minLength={3} maxLength={1000} required />
        </label>
        <button disabled={busy}>Record nominee decision</button>
      </form>
      <p role="status">{message}</p>
    </article>
  );
}
export function NomineeVerificationQueue({ admin = false }: { admin?: boolean }) {
  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/${admin ? "admin" : "coordinator"}/nominees`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Queue unavailable");
      setNominees(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Queue unavailable");
    }
  }, [admin]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section>
      <h2>Nominee verification</h2>
      <p role="status">{message}</p>
      <button onClick={() => void load()}>Refresh nominees</button>
      {!nominees.length && <p>No nominee submissions await verification.</p>}
      {nominees.map((nominee) => (
        <Review key={nominee.externalId} nominee={nominee} admin={admin} done={load} />
      ))}
    </section>
  );
}
