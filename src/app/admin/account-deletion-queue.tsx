"use client";

import { useCallback, useEffect, useState } from "react";

type DeletionRequest = {
  externalId: string;
  status: string;
  requestedAt: string;
  memberMessage: string | null;
  user: { externalId: string; email: string | null; member: { fullName: string } | null };
};

export function AccountDeletionQueue() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoaded(false);
    try {
      const response = await fetch(`/api/admin/account-deletion?page=${page}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Deletion requests could not be loaded.");
      setRequests(await response.json());
      setLoaded(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request unavailable.");
    }
  }, [page]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-label="Account deletion requests">
      <p>
        Verify identity, document any retention requirements and arrange deletion through the
        Foundation’s privacy process. Messages saved below are visible to the account owner.
      </p>
      {message && <p role="status">{message}</p>}
      {!loaded ? (
        <button disabled={busy} onClick={() => void load()}>
          Reload requests
        </button>
      ) : requests.length ? (
        requests.map((request) => (
          <article key={request.externalId}>
            <h2>{request.user.member?.fullName ?? "Account holder"}</h2>
            <p>{request.user.email ?? request.user.externalId}</p>
            <p>
              {request.status === "PENDING" ? "Pending" : "In review"} ·{" "}
              {new Date(request.requestedAt).toLocaleDateString("en-IN")}
            </p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                const form = new FormData(event.currentTarget);
                setBusy(true);
                setMessage("");
                try {
                  const response = await fetch("/api/admin/account-deletion", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      requestId: request.externalId,
                      memberMessage: form.get("memberMessage"),
                    }),
                  });
                  if (!response.ok)
                    throw new Error("Review could not be saved. Reload the queue and retry.");
                  setMessage(
                    "Review saved. The account owner can read your message on their deletion page.",
                  );
                  await load();
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Review unavailable.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Message to account owner
                <textarea
                  name="memberMessage"
                  required
                  minLength={10}
                  maxLength={1000}
                  defaultValue={request.memberMessage ?? ""}
                />
              </label>
              <button disabled={busy}>Save review</button>
            </form>
          </article>
        ))
      ) : (
        <p>No pending deletion requests.</p>
      )}
      <div className="due-actions">
        <button disabled={busy || page === 1} onClick={() => setPage((value) => value - 1)}>
          Previous
        </button>
        <span>Page {page}</span>
        <button
          disabled={busy || !loaded || requests.length < 20}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
