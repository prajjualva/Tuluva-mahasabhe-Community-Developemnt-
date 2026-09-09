"use client";
import { useEffect, useState } from "react";

type AuditRecord = {
  action: string;
  entityType: string;
  createdAt: string;
  reason: string | null;
  actorRole: string | null;
  actor: { externalId: string } | null;
};
export function AdminAuditFeed() {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  useEffect(() => {
    void fetch("/api/admin/audit").then(async (response) => {
      if (response.ok) setRecords(await response.json());
    });
  }, []);
  return (
    <article>
      <h2>Recent audit activity</h2>
      {records.length ? (
        records.map((record, index) => (
          <p key={`${record.action}-${record.createdAt}-${index}`}>
            <strong>{record.action}</strong> · {record.entityType} ·{" "}
            {new Date(record.createdAt).toLocaleString()}
            {record.reason ? ` · ${record.reason}` : ""}
          </p>
        ))
      ) : (
        <p>No audit records available for this session.</p>
      )}
    </article>
  );
}
