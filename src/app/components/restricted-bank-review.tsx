"use client";
import { FormEvent, useState } from "react";
export function RestrictedBankReview({ nomineeExternalId }: { nomineeExternalId: string }) {
  const [details, setDetails] = useState<{
    accountHolderName: string;
    accountNumber: string;
    ifsc: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const review = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/nominees/${nomineeExternalId}/bank`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: form.get("reason") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Bank review denied");
      setDetails(result);
      setMessage("Sensitive bank access was recorded in the audit log.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bank review failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Restricted nominee bank review">
      <form onSubmit={review}>
        <label>
          Reason for bank review
          <textarea name="reason" minLength={3} maxLength={1000} required />
        </label>
        <button disabled={busy}>Review restricted bank details</button>
      </form>
      <p role="status">{message}</p>
      {details && (
        <>
          <p>{details.accountHolderName}</p>
          <p>Account: {details.accountNumber}</p>
          <p>IFSC: {details.ifsc}</p>
          <button onClick={() => setDetails(null)}>Hide details</button>
        </>
      )}
    </section>
  );
}
