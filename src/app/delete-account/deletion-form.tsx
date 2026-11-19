"use client";

import { useEffect, useState } from "react";

type Request = {
  externalId: string;
  status: "PENDING" | "IN_REVIEW" | "CANCELLED";
  requestedAt: string;
  memberMessage: string | null;
};

export function DeletionForm() {
  const [request, setRequest] = useState<Request | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/account/deletion", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Your request could not be loaded. Reload to try again.");
        const value = await response.json();
        if (active) {
          setRequest(value);
          setLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "Request unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(method: "POST" | "DELETE") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/deletion", {
        method,
        ...(method === "POST"
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirm: true }),
            }
          : {}),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "The request could not be saved.");
      setRequest(value);
      setConfirmed(false);
      setMessage(
        method === "POST"
          ? "Your request is recorded for Foundation review."
          : "Your request was cancelled.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The request could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const pending = request && request.status !== "CANCELLED";
  return (
    <article aria-label="Account deletion request">
      <h2>Request account deletion</h2>
      {message && <p role="status">{message}</p>}
      {!loaded ? (
        <p>Loading your request…</p>
      ) : pending ? (
        <>
          <p>
            <strong>{request.status === "IN_REVIEW" ? "Under review" : "Request received"}</strong>
          </p>
          <p>Requested {new Date(request.requestedAt).toLocaleDateString("en-IN")}</p>
          <p className="profile-member-reference">
            Request reference <span>{request.externalId}</span>
          </p>
          {request.memberMessage && <p className="feedback-message">{request.memberMessage}</p>}
          <button disabled={busy} type="button" onClick={() => void submit("DELETE")}>
            Cancel this request
          </button>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmed) void submit("POST");
          }}
        >
          <label className="consent-label">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I request deletion of my Tuluva Mahasabhe account and associated personal data.
          </label>
          <p>
            The Foundation will review your identity, ongoing financial matters and any required
            record retention before processing the request.
          </p>
          <button type="submit" disabled={busy || !confirmed}>
            {busy ? "Submitting…" : "Submit deletion request"}
          </button>
        </form>
      )}
    </article>
  );
}
