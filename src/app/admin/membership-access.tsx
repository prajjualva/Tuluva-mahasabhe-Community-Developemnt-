"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
type Candidate = { externalId: string; fullName: string; amountPaise: number };
export function AdminMembershipAccess() {
  const [members, setMembers] = useState<Candidate[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [action, setAction] = useState("RECORD_PAYMENT");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const command = useRef<string | null>(null);
  const load = useCallback(async (term = "") => {
    const response = await fetch(
      `/api/admin/membership-access?search=${encodeURIComponent(term)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error("Membership registrations could not be loaded.");
    setMembers(await response.json());
  }, []);
  useEffect(() => {
    void load().catch((error) => setMessage(error.message));
  }, [load]);
  const member = members.find((item) => item.externalId === selected);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !member) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    command.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/admin/membership-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberExternalId: member.externalId,
          action,
          reason: form.get("reason"),
          idempotencyKey: command.current,
          ...(action === "RECORD_PAYMENT"
            ? {
                reference: form.get("reference"),
                receivedAt: new Date(String(form.get("receivedAt"))).toISOString(),
                fundsReceived: form.get("confirmed") === "on",
              }
            : { confirmFeeExemption: form.get("confirmed") === "on" }),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Membership update failed.");
      setMessage(
        action === "RECORD_PAYMENT"
          ? `Membership unlocked. Payment recorded; receipt ${result.receiptNumber}.`
          : "Membership unlocked with an approved fee exemption. No payment was recorded.",
      );
      setSelected("");
      command.current = null;
      await load(search);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Membership update unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article>
      <h2>Activate a registered membership</h2>
      <p>
        Confirm an offline initial membership payment, or approve an initial fee exemption. A
        pending online or Coordinator payment must be resolved first. Community Support Plan
        approval remains separate.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load(search).catch((error) => setMessage(error.message));
        }}
      >
        <label>
          Find registration
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={160}
            placeholder="Member name or member ID"
          />
        </label>
        <button disabled={busy}>Search registrations</button>
      </form>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            Member
            <select
              value={selected}
              required
              onChange={(event) => {
                setSelected(event.target.value);
                command.current = null;
              }}
            >
              <option value="">Choose a registration</option>
              {members.map((item) => (
                <option key={item.externalId} value={item.externalId}>
                  {item.fullName} · {item.externalId}
                </option>
              ))}
            </select>
          </label>
          {member && (
            <p>
              Initial membership due:{" "}
              {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
                member.amountPaise / 100,
              )}
            </p>
          )}
          <label>
            Action
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                command.current = null;
              }}
            >
              <option value="RECORD_PAYMENT">Record payment already received</option>
              <option value="GRANT">Grant membership with fee exemption</option>
            </select>
          </label>
          {action === "RECORD_PAYMENT" && (
            <>
              <label>
                Bank / cash reference
                <input name="reference" required minLength={3} maxLength={100} />
              </label>
              <label>
                Received date and time
                <input name="receivedAt" type="datetime-local" required />
              </label>
            </>
          )}
          <label>
            Reason
            <textarea name="reason" required minLength={8} maxLength={1000} />
          </label>
          <label className="checkbox-label">
            <input name="confirmed" type="checkbox" required key={action} />
            {action === "RECORD_PAYMENT"
              ? "I confirm the Foundation has received the full membership amount."
              : "I approve this initial membership fee exemption. No money was received."}
          </label>
          <button disabled={!member}>
            {busy
              ? "Recording…"
              : action === "RECORD_PAYMENT"
                ? "Confirm payment & unlock membership"
                : "Grant membership"}
          </button>
        </fieldset>
      </form>
      <p role="status">{message}</p>
    </article>
  );
}
