"use client";

import { useEffect, useState } from "react";

type DeathReport = {
  externalId: string;
  placeOfDeath: string;
  dateOfDeath: string;
  details: string | null;
  status?: string;
  requiresAdminReview?: boolean;
  documents: Array<{
    externalId: string;
    contentType: string;
    originalFilename: string;
    sizeBytes: number;
  }>;
  member: { externalId: string; fullName: string; address: string; status?: string } | null;
};

/** Queue for active Coordinators; server authorization limits it to their scope. */
export function CoordinatorDeathReportQueue() {
  const [reports, setReports] = useState<DeathReport[]>([]);
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await fetch("/api/coordinator/death-reports");
      const data = (await response.json()) as { reports?: DeathReport[]; error?: string };
      if (response.ok) setReports(data.reports ?? []);
      else setMessage(data.error ?? "Sign in as an active Coordinator to review death reports.");
    } catch {
      setMessage("Death reports are temporarily unavailable.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const confirm = async (externalId: string) => {
    setWorkingId(externalId);
    try {
      const response = await fetch(
        `/api/coordinator/death-reports/${encodeURIComponent(externalId)}/confirm`,
        { method: "POST" },
      );
      const data = (await response.json()) as { error?: string };
      setMessage(
        response.ok
          ? "Coordinator confirmation recorded. The report is now in Administrator verification."
          : (data.error ?? "Confirmation was denied."),
      );
      await load();
    } catch {
      setMessage("Confirmation could not be recorded. Please try again.");
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <article>
      <h2>Death report confirmation</h2>
      <p>
        Confirm only reports you can verify. Administrator review remains required before a Death
        Support Event is approved or published.
      </p>
      {message && <p role="status">{message}</p>}
      {reports.length ? (
        reports.map((report) => (
          <section className="queue-item" key={report.externalId}>
            <strong>{report.member?.fullName ?? "Member not found"}</strong>
            <p>
              {report.member?.status ?? "ASSIGNED"} ·{" "}
              {(report.status ?? "REPORTED").replaceAll("_", " ")}
            </p>
            <p>
              Death reported on {new Date(report.dateOfDeath).toLocaleDateString()} at{" "}
              {report.placeOfDeath}
            </p>
            {report.member?.address && <p>Member address: {report.member.address}</p>}
            {report.details && <p>{report.details}</p>}
            <p>{report.documents.length} restricted supporting document(s)</p>
            {report.documents.length > 0 && (
              <ul>
                {report.documents.map((document) => (
                  <li key={document.externalId}>
                    {document.originalFilename} · {document.contentType} · {document.sizeBytes}{" "}
                    bytes ·{" "}
                    <a
                      href={`/api/coordinator/death-reports/${encodeURIComponent(report.externalId)}/documents/${encodeURIComponent(document.externalId)}/download`}
                    >
                      Download restricted evidence
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {report.requiresAdminReview && (
              <p className="warning">
                This report needs Administrator review because of the membership status or waiting
                period.
              </p>
            )}
            <button
              onClick={() => void confirm(report.externalId)}
              disabled={
                workingId === report.externalId ||
                (report.status !== undefined && report.status !== "REPORTED")
              }
            >
              {workingId === report.externalId ? "Confirming…" : "Confirm and send to Admin"}
            </button>
          </section>
        ))
      ) : (
        <p>No death reports await your confirmation.</p>
      )}
    </article>
  );
}
