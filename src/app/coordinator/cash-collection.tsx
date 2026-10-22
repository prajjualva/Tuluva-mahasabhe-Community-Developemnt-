"use client";
import { useEffect, useRef, useState } from "react";
import { readRecord } from "../components/read-record";

type Due = {
  externalId: string;
  purpose: string;
  amountPaise: number;
  dueAt: string;
  status: string;
};
type Member = { externalId: string; fullName: string; status: string; dues: Due[] };
const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

export function CoordinatorCashCollection() {
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const lock = useRef(false);
  const load = async () => {
    setLoading(true);
    const response = await readRecord<Member[]>("/api/coordinator/members");
    setMembers(response.ok ? response.data : []);
    setUnavailable(!response.ok);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const recordCollection = async (member: Member, due: Due, method: "CASH" | "MANUAL") => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/coordinator/cash", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberExternalId: member.externalId,
          dueExternalId: due.externalId,
          idempotencyKey: crypto.randomUUID(),
          method,
        }),
      });
      const result = await response.json();
      setMessage(
        response.ok
          ? `${method === "CASH" ? "Cash collection" : "Manual payment"} recorded. It now awaits Administrator verification.`
          : (result.error ?? "Could not record this Coordinator payment."),
      );
      if (response.ok) window.dispatchEvent(new Event("cash-collection-recorded"));
      await load();
    } catch {
      setMessage("Could not reach the server. Refresh before trying again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <article>
      <h2>Assigned-member payment collections</h2>
      <p role="status">{message}</p>
      {unavailable && (
        <p role="status">
          Assigned members could not be loaded.{" "}
          <button disabled={loading || busy} onClick={() => void load()}>
            Retry loading members
          </button>
        </p>
      )}
      {loading ? (
        <p>Loading assigned members…</p>
      ) : unavailable ? null : members.length ? (
        members.map((member) => (
          <section key={member.externalId}>
            <strong>{member.fullName}</strong>
            <p>{member.status}</p>
            {member.dues.length ? (
              member.dues.map((due) => (
                <div key={due.externalId}>
                  {due.purpose} · {rupees(due.amountPaise)}{" "}
                  <button disabled={busy} onClick={() => recordCollection(member, due, "CASH")}>
                    Record cash received
                  </button>
                  <button disabled={busy} onClick={() => recordCollection(member, due, "MANUAL")}>
                    Record manual payment
                  </button>
                </div>
              ))
            ) : (
              <p>No unpaid dues.</p>
            )}
          </section>
        ))
      ) : (
        <p>No assigned members found.</p>
      )}
    </article>
  );
}
