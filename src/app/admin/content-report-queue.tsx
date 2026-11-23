"use client";
import { useEffect, useState } from "react";
type Report = {
  externalId: string;
  kind: string;
  reason: string;
  createdAt: string;
  comment: { body: string; status: string } | null;
};
export function ContentReportQueue() {
  const [reports, setReports] = useState<Report[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/content-reports");
      const data = await r.json();
      if (!r.ok) throw Error();
      setReports(data.reports);
      setLoaded(true);
    } catch {
      setMessage("Reports could not be loaded. Retry below.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function review(reportExternalId: string, decision: "REMOVED" | "DISMISSED") {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/content-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportExternalId, decision, reason: reasons[reportExternalId] }),
      });
      if (!r.ok) throw Error();
      setMessage(
        decision === "REMOVED"
          ? "Comment removed and decision audited."
          : "Report dismissed and decision audited.",
      );
      await load();
    } catch {
      setMessage("Decision could not be saved. Retry below.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article>
      <h2>Reports awaiting review</h2>
      <p>
        Review reports promptly. Keep the reporter’s identity private. Removal affects all readers;
        dismissal leaves the comment visible.
      </p>
      <button onClick={() => void load()} disabled={busy || loading}>
        Refresh reports
      </button>
      {message && <p role="status">{message}</p>}
      {loading && <p role="status">Loading reports…</p>}
      {loaded && !loading && !reports.length && <p>No reports awaiting review.</p>}
      {reports.map((report) => (
        <section className="queue-item" key={report.externalId}>
          <p className="eyebrow">
            {report.kind === "NEWS_COMMENT" ? "Community news" : "Condolence"} ·{" "}
            {new Date(report.createdAt).toLocaleString()}
          </p>
          <p>
            <strong>Reported message:</strong> {report.comment?.body ?? "Comment unavailable"}
          </p>
          <p>
            <strong>Report reason:</strong> {report.reason}
          </p>
          <label>
            Decision reason
            <textarea
              minLength={3}
              maxLength={1000}
              value={reasons[report.externalId] ?? ""}
              onChange={(e) => setReasons({ ...reasons, [report.externalId]: e.target.value })}
            />
          </label>
          <div className="button-row">
            <button
              disabled={busy || (reasons[report.externalId] ?? "").trim().length < 3}
              onClick={() => void review(report.externalId, "REMOVED")}
            >
              Remove comment
            </button>
            <button
              disabled={busy || (reasons[report.externalId] ?? "").trim().length < 3}
              onClick={() => void review(report.externalId, "DISMISSED")}
            >
              Dismiss report
            </button>
          </div>
        </section>
      ))}
    </article>
  );
}
