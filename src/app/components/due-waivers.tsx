"use client";
import { FormEvent, useEffect, useState } from "react";
type Waiver = {
  externalId: string;
  status: string;
  reason: string;
  decisionReason: string | null;
  due: { externalId: string; purpose: string; amountPaise: number; member: { fullName: string } };
};
export function DueWaivers({ admin = false }: { admin?: boolean }) {
  const path = admin ? "/api/admin/waivers" : "/api/coordinator/waivers";
  const [requests, setRequests] = useState<Waiver[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState("");
  async function load() {
    try {
      const result = await fetch(path);
      const data = await result.json();
      if (!result.ok) throw new Error(data.error);
      setRequests(data.requests);
    } catch {
      setMessage("Waiver requests could not be loaded.");
    }
  }
  useEffect(() => {
    let mounted = true;
    void fetch(path)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (mounted) setRequests(data.requests);
      })
      .catch(() => {
        if (mounted) setMessage("Waiver requests could not be loaded.");
      });
    return () => {
      mounted = false;
    };
  }, [path]);
  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const commandKey = key || crypto.randomUUID();
    setKey(commandKey);
    try {
      const result = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dueExternalId: data.get("dueExternalId"),
          reason: data.get("reason"),
          idempotencyKey: commandKey,
        }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error);
      setKey("");
      form.reset();
      setMessage("Waiver requested. The due remains payable until Admin approval.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function decide(item: Waiver, approved: boolean, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const reason = new FormData(event.currentTarget).get("reason");
    setBusy(true);
    try {
      const result = await fetch(`/api/admin/waivers/${item.externalId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approved, reason }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error);
      setMessage("Decision recorded.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article>
      <h2>Due waiver requests</h2>
      <p>
        Only Admin can approve a waiver. Waivers never count as successful payments or automatically
        reactivate membership.
      </p>
      {!admin && (
        <form onSubmit={request}>
          <label>
            Assigned member due reference
            <input name="dueExternalId" required onChange={() => setKey("")} />
          </label>
          <label>
            Reason
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={1000}
              onChange={() => setKey("")}
            />
          </label>
          <button disabled={busy}>Request Admin waiver</button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      {requests.map((item) => (
        <section key={item.externalId}>
          <h3>
            {item.due.member.fullName} · {item.due.purpose}
          </h3>
          <p>
            ₹{(item.due.amountPaise / 100).toFixed(2)} · {item.status}
          </p>
          <p>{item.reason}</p>
          {item.decisionReason && <p>Admin decision: {item.decisionReason}</p>}
          {admin && item.status === "PENDING" && (
            <form
              onSubmit={(event) => {
                const button = (event.nativeEvent as SubmitEvent)
                  .submitter as HTMLButtonElement | null;
                void decide(item, button?.value === "approve", event);
              }}
            >
              <label>
                Mandatory decision reason
                <textarea name="reason" required minLength={3} maxLength={1000} />
              </label>
              <button value="approve" disabled={busy}>
                Approve waiver
              </button>
              <button value="reject" disabled={busy}>
                Reject waiver
              </button>
            </form>
          )}
        </section>
      ))}
      {!requests.length && <p>No waiver requests to display.</p>}
    </article>
  );
}
