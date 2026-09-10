"use client";

import { useState } from "react";

export function AdminWalletCredit() {
  const [memberExternalId, setMemberExternalId] = useState("");
  const [amountRupees, setAmountRupees] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await fetch(
      `/api/admin/wallets/${encodeURIComponent(memberExternalId)}/credit`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountRupees, reason }),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Wallet credit was denied.");
      return;
    }
    setMessage(`Wallet credited. New balance: ₹${(data.balanceAfterPaise / 100).toFixed(2)}.`);
    setAmountRupees("");
    setReason("");
  };

  return (
    <article>
      <h2>Approved wallet credit</h2>
      <p>
        Use only for an approved adjustment or refund. Your reason is recorded in the audit log.
      </p>
      <p>{message}</p>
      <form onSubmit={submit}>
        <label>
          Member external ID
          <input
            required
            value={memberExternalId}
            onChange={(event) => setMemberExternalId(event.target.value)}
          />
        </label>
        <label>
          Amount (₹)
          <input
            required
            inputMode="decimal"
            value={amountRupees}
            onChange={(event) => setAmountRupees(event.target.value)}
          />
        </label>
        <label>
          Reason
          <input required value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <button type="submit">Record wallet credit</button>
      </form>
    </article>
  );
}
