"use client";
import { useCallback, useEffect, useState } from "react";

type AuditRecord = {
  externalId: string;
  action: string;
  entityType: string;
  createdAt: string;
  reason: string | null;
  actorRole: string | null;
  actor: { externalId: string } | null;
  beforeState: unknown;
  afterState: unknown;
  requestId: string | null;
};
export function AdminAuditFeed() {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/audit?page=${page}&${query}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Audit search failed");
      setRecords(result.records);
      setTotal(result.total);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Audit search failed");
    }
  }, [page, query]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <article>
      <h2>Audit search</h2>
      <p role="status">{message}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const params = new URLSearchParams();
          for (const field of ["search", "action", "entityType", "actorExternalId", "requestId"]) {
            const value = String(form.get(field) ?? "").trim();
            if (value) params.set(field, value);
          }
          for (const field of ["from", "to"]) {
            const value = String(form.get(field) ?? "");
            if (value) params.set(field, new Date(value).toISOString());
          }
          setPage(1);
          setQuery(params.toString());
        }}
      >
        <label>
          Search activity
          <input name="search" maxLength={160} />
        </label>
        <label>
          Action
          <input name="action" maxLength={160} />
        </label>
        <label>
          Entity type
          <input name="entityType" maxLength={100} />
        </label>
        <label>
          Actor reference
          <input name="actorExternalId" />
        </label>
        <label>
          Correlation / request ID
          <input name="requestId" maxLength={200} />
        </label>
        <label>
          From
          <input type="datetime-local" name="from" />
        </label>
        <label>
          To
          <input type="datetime-local" name="to" />
        </label>
        <button>Search audit records</button>
      </form>
      <p>{total} audit records found. Audit records cannot be edited or deleted here.</p>
      {records.length ? (
        records.map((record) => (
          <section key={record.externalId}>
            <strong>{record.action}</strong> · {record.entityType} ·{" "}
            {new Date(record.createdAt).toLocaleString()}
            <p>Actor: {record.actor?.externalId ?? record.actorRole ?? "System"}</p>
            <p>{record.reason ?? "No reason recorded"}</p>
            <p>Request: {record.requestId ?? "Legacy / background operation"}</p>
            <details>
              <summary>Before / after</summary>
              <pre>
                {JSON.stringify({ before: record.beforeState, after: record.afterState }, null, 2)}
              </pre>
            </details>
          </section>
        ))
      ) : (
        <p>No audit records available for this session.</p>
      )}
      <button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
        Previous audit records
      </button>
      <span> Page {page} </span>
      <button disabled={page * 50 >= total} onClick={() => setPage((value) => value + 1)}>
        Next audit records
      </button>
    </article>
  );
}
