"use client";

import { useEffect, useState } from "react";

type RestrictedDocument = {
  externalId: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
};
type AdminDeathReport = {
  externalId: string;
  reporterIdentity: string;
  placeOfDeath: string;
  dateOfDeath: string;
  details: string | null;
  status: string;
  requiresAdminReview: boolean;
  eligibilityStatus: string;
  eligibilityReason: string | null;
  member: { externalId: string; fullName: string; status: string } | null;
  verifiedNominee: {
    externalId?: string;
    fullName: string;
    relationship?: string;
    status: string;
  } | null;
  documents: RestrictedDocument[];
};
type ManagedEvent = {
  externalId: string;
  status: "APPROVED" | "PUBLISHED" | "CLOSED" | "CANCELLED";
  memberName: string;
  placeOfDeath: string;
  dateOfDeath: string;
  publicDetails: string | null;
  publishedAt: string | null;
  settledContributionCount?: number;
};
type ModerationComment = {
  externalId: string;
  authorName: string;
  body: string;
  createdAt: string;
};
type LinkableMember = {
  externalId: string;
  fullName: string;
  mobile: string | null;
  email: string | null;
  address: string;
  status: string;
  existingEventExternalId: string | null;
  hasOpenDeathReport: boolean;
};

const displayDate = (value: string) => new Date(value).toLocaleDateString();

/**
 * Administrative review and event lifecycle controls. Every mutation is sent
 * to a protected server API where status transitions, audit records and any
 * financial compensations are executed transactionally.
 */
export function AdminDeathSupportQueue() {
  const [reports, setReports] = useState<AdminDeathReport[]>([]);
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [comments, setComments] = useState<Record<string, ModerationComment[]>>({});
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  const load = async () => {
    try {
      const [reportsResponse, eventsResponse] = await Promise.all([
        fetch("/api/admin/death-reports"),
        fetch("/api/admin/death-events"),
      ]);
      const reportsData = (await reportsResponse.json()) as {
        reports?: AdminDeathReport[];
        error?: string;
      };
      const eventsData = (await eventsResponse.json()) as {
        events?: ManagedEvent[];
        error?: string;
      };
      if (reportsResponse.ok) setReports(reportsData.reports ?? []);
      else setMessage(reportsData.error ?? "Sign in as an Administrator to review death reports.");
      if (eventsResponse.ok) setEvents(eventsData.events ?? []);
      else if (reportsResponse.ok)
        setMessage(eventsData.error ?? "Death Support Events are temporarily unavailable.");
    } catch {
      setMessage("Death Support queues are temporarily unavailable.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const reviewReport = async (report: AdminDeathReport, decision: "APPROVE" | "REJECT") => {
    const reason = window.prompt(
      decision === "REJECT"
        ? "Reason for rejection (required and recorded in the audit log)"
        : "Verification or override reason (required and recorded in the audit log)",
    );
    if (!reason?.trim()) return;
    const publicDetails =
      decision === "APPROVE"
        ? window.prompt("Permitted public supporting information (optional)")
        : undefined;
    if (publicDetails === null) return;
    setWorking(`report-${report.externalId}`);
    try {
      const response = await fetch(
        `/api/admin/death-reports/${encodeURIComponent(report.externalId)}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision,
            reason,
            ...(decision === "APPROVE" ? { publicDetails } : {}),
          }),
        },
      );
      const data = (await response.json()) as { error?: string };
      setMessage(
        response.ok
          ? decision === "APPROVE"
            ? "Death report approved. It is ready to become a Death Support Event."
            : "Death report rejected with the recorded Administrator reason."
          : (data.error ?? "The report could not be reviewed."),
      );
      await load();
    } catch {
      setMessage("The report could not be reviewed. Please try again.");
    } finally {
      setWorking(null);
    }
  };

  const linkUnmatchedReport = async (report: AdminDeathReport) => {
    const query = window.prompt("Search for the existing member to link to this report");
    if (!query?.trim()) return;
    setWorking(`report-${report.externalId}`);
    try {
      const searchResponse = await fetch(
        `/api/admin/death-reports/members?query=${encodeURIComponent(query.trim())}`,
      );
      const searchData = (await searchResponse.json()) as {
        members?: LinkableMember[];
        error?: string;
      };
      if (!searchResponse.ok) {
        setMessage(searchData.error ?? "Member search could not be completed.");
        return;
      }
      const candidates = (searchData.members ?? []).filter(
        (member) =>
          member.status !== "DECEASED" &&
          !member.hasOpenDeathReport &&
          !member.existingEventExternalId,
      );
      if (!candidates.length) {
        setMessage(
          "No eligible existing member matched this search. The report remains with Admin.",
        );
        return;
      }
      const selection = window.prompt(
        `Enter the number for the correct member:\n${candidates
          .map(
            (member, index) =>
              `${index + 1}. ${member.fullName} · ${member.mobile ?? "No mobile"} · ${member.address}`,
          )
          .join("\n")}`,
        "1",
      );
      const selectedIndex = Number.parseInt(selection ?? "", 10) - 1;
      const member = candidates[selectedIndex];
      if (!member) {
        setMessage("No member was linked because the selection was invalid.");
        return;
      }
      if (
        !window.confirm(
          `Link this public report to ${member.fullName}? It will remain in Administrator verification.`,
        )
      )
        return;
      const response = await fetch(
        `/api/admin/death-reports/${encodeURIComponent(report.externalId)}/link-member`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ memberExternalId: member.externalId }),
        },
      );
      const data = (await response.json()) as { error?: string };
      setMessage(
        response.ok
          ? "Member linked. Verify the report and approve or reject it in the Administrator queue."
          : (data.error ?? "The report could not be linked to that member."),
      );
      await load();
    } catch {
      setMessage("The report could not be linked to a member. Please try again.");
    } finally {
      setWorking(null);
    }
  };

  const publish = async (event: ManagedEvent) => {
    setWorking(`event-${event.externalId}`);
    try {
      const response = await fetch(
        `/api/admin/death-events/${encodeURIComponent(event.externalId)}/publish`,
        { method: "POST" },
      );
      const data = (await response.json()) as {
        error?: string;
        createdContributionCount?: number;
        createdCount?: number;
      };
      const createdContributionCount = data.createdContributionCount ?? data.createdCount;
      setMessage(
        response.ok
          ? `Event published${
              typeof createdContributionCount === "number"
                ? `; ${createdContributionCount} historical ₹100 obligations were created.`
                : "."
            }`
          : (data.error ?? "The event could not be published."),
      );
      await load();
    } catch {
      setMessage("The event could not be published. Please try again.");
    } finally {
      setWorking(null);
    }
  };

  const edit = async (event: ManagedEvent) => {
    const placeOfDeath = window.prompt("Public place of death", event.placeOfDeath);
    if (placeOfDeath === null) return;
    const dateOfDeath = window.prompt("Date of death (YYYY-MM-DD)", event.dateOfDeath.slice(0, 10));
    if (dateOfDeath === null) return;
    const publicDetails = window.prompt(
      "Permitted public supporting information (leave empty to remove)",
      event.publicDetails ?? "",
    );
    if (publicDetails === null) return;
    const reason = window.prompt("Reason for this published-event edit (recorded in audit log)");
    if (!reason?.trim()) return;
    setWorking(`event-${event.externalId}`);
    try {
      const response = await fetch(
        `/api/admin/death-events/${encodeURIComponent(event.externalId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ placeOfDeath, dateOfDeath, publicDetails, reason }),
        },
      );
      const data = (await response.json()) as { error?: string };
      setMessage(
        response.ok
          ? "Published event edited with your reason and audit record."
          : (data.error ?? "The event could not be edited."),
      );
      await load();
    } catch {
      setMessage("The event could not be edited. Please try again.");
    } finally {
      setWorking(null);
    }
  };

  const cancel = async (event: ManagedEvent) => {
    const reason = window.prompt(
      "Reason for cancellation (required and recorded in the audit log)",
    );
    if (!reason?.trim()) return;
    const settlementMethod =
      (event.settledContributionCount ?? 0) > 0 &&
      window.confirm(
        "Use Foundation Wallet credit for any paid contribution reversal? Select Cancel to refund to each original method.",
      )
        ? "FOUNDATION_WALLET"
        : "ORIGINAL_METHOD";
    setWorking(`event-${event.externalId}`);
    try {
      const response = await fetch(
        `/api/admin/death-events/${encodeURIComponent(event.externalId)}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason, settlementMethod }),
        },
      );
      const data = (await response.json()) as { error?: string };
      setMessage(
        response.ok
          ? "Event cancellation was recorded. Any paid contributions are being reversed by the selected method."
          : (data.error ?? "The event could not be cancelled."),
      );
      await load();
    } catch {
      setMessage("The event could not be cancelled. Please try again.");
    } finally {
      setWorking(null);
    }
  };

  const close = async (event: ManagedEvent) => {
    const reason = window.prompt("Reason for closing this event (recorded in the audit log)");
    if (!reason?.trim()) return;
    setWorking(`event-${event.externalId}`);
    try {
      const response = await fetch(
        `/api/admin/death-events/${encodeURIComponent(event.externalId)}/close`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      const data = (await response.json()) as { error?: string };
      setMessage(
        response.ok
          ? "Event closed with the Administrator reason and audit record preserved."
          : (data.error ?? "The event could not be closed."),
      );
      await load();
    } catch {
      setMessage("The event could not be closed. Please try again.");
    } finally {
      setWorking(null);
    }
  };

  const loadComments = async (eventExternalId: string) => {
    try {
      const response = await fetch(
        `/api/admin/death-events/${encodeURIComponent(eventExternalId)}/comments`,
      );
      const data = (await response.json()) as { comments?: ModerationComment[]; error?: string };
      if (response.ok)
        setComments((existing) => ({ ...existing, [eventExternalId]: data.comments ?? [] }));
      else setMessage(data.error ?? "Comments could not be loaded.");
    } catch {
      setMessage("Comments could not be loaded.");
    }
  };

  const moderateComment = async (eventExternalId: string, commentExternalId: string) => {
    const reason = window.prompt("Reason for moderation (required and recorded in audit log)");
    if (!reason?.trim()) return;
    setWorking(`comment-${commentExternalId}`);
    try {
      const response = await fetch(
        `/api/admin/death-events/${encodeURIComponent(eventExternalId)}/comments/${encodeURIComponent(commentExternalId)}/moderate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      const data = (await response.json()) as { error?: string };
      setMessage(
        response.ok
          ? "Comment moderated and audit recorded."
          : (data.error ?? "Moderation failed."),
      );
      await loadComments(eventExternalId);
    } catch {
      setMessage("Moderation failed. Please try again.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <>
      <article>
        <h2>Death report verification</h2>
        <p>
          Verify evidence, membership status, waiting-period review, preliminary eligibility, and
          nominee status before approval. Approval does not publish an event by itself.
        </p>
        {message && <p role="status">{message}</p>}
        {reports.length ? (
          reports.map((report) => (
            <section className="queue-item" key={report.externalId}>
              <strong>{report.member?.fullName ?? "Member not found"}</strong>
              <p>
                {report.status.replaceAll("_", " ")} · Eligibility: {report.eligibilityStatus}
              </p>
              <p>
                Death reported on {displayDate(report.dateOfDeath)} at {report.placeOfDeath}
              </p>
              <p>Reporter: {report.reporterIdentity}</p>
              {report.details && <p>{report.details}</p>}
              {report.eligibilityReason && <p>Review note: {report.eligibilityReason}</p>}
              <p>
                Verified nominee: {report.verifiedNominee?.fullName ?? "Not yet verified"}
                {report.verifiedNominee
                  ? ` · ${report.verifiedNominee.relationship ?? "Nominee"} · ${report.verifiedNominee.status}`
                  : ""}
              </p>
              <p>{report.documents.length} restricted evidence file(s) attached</p>
              {report.documents.length > 0 && (
                <ul>
                  {report.documents.map((document) => (
                    <li key={document.externalId}>
                      {document.originalFilename} · {document.contentType} · {document.sizeBytes}{" "}
                      bytes ·{" "}
                      <a
                        href={`/api/admin/death-reports/${encodeURIComponent(report.externalId)}/documents/${encodeURIComponent(document.externalId)}/download`}
                      >
                        Download restricted evidence
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {!report.member && report.status === "ADMIN_VERIFICATION" && (
                <button
                  onClick={() => void linkUnmatchedReport(report)}
                  disabled={working === `report-${report.externalId}`}
                >
                  Find and link existing member
                </button>
              )}
              <button
                onClick={() => void reviewReport(report, "APPROVE")}
                disabled={
                  working === `report-${report.externalId}` ||
                  ["APPROVED", "REJECTED", "CANCELLED", "CLOSED"].includes(report.status)
                }
              >
                Approve report
              </button>
              <button
                onClick={() => void reviewReport(report, "REJECT")}
                disabled={
                  working === `report-${report.externalId}` ||
                  ["APPROVED", "REJECTED", "CANCELLED", "CLOSED"].includes(report.status)
                }
              >
                Reject with reason
              </button>
            </section>
          ))
        ) : (
          <p>No death reports await Administrator verification.</p>
        )}
      </article>

      <article>
        <h2>Death Support Event management</h2>
        <p>
          Events remain historical records. Administrators can publish, edit, close, or cancel; they
          cannot permanently delete an event.
        </p>
        {events.length ? (
          events.map((event) => (
            <section className="queue-item" key={event.externalId}>
              <strong>{event.memberName}</strong>
              <p>
                {event.status} · {displayDate(event.dateOfDeath)} · {event.placeOfDeath}
              </p>
              {event.publicDetails && <p>{event.publicDetails}</p>}
              {event.publishedAt && (
                <p>Published: {new Date(event.publishedAt).toLocaleString()}</p>
              )}
              <p>Settled ₹100 contribution payments: {event.settledContributionCount ?? 0}</p>
              {event.status === "APPROVED" && (
                <button
                  onClick={() => void publish(event)}
                  disabled={working === `event-${event.externalId}`}
                >
                  Publish event and create contribution dues
                </button>
              )}
              {event.status === "PUBLISHED" && (
                <>
                  <button
                    onClick={() => void edit(event)}
                    disabled={working === `event-${event.externalId}`}
                  >
                    Edit published information
                  </button>
                  <button
                    onClick={() => void cancel(event)}
                    disabled={working === `event-${event.externalId}`}
                  >
                    Cancel event with reversal plan
                  </button>
                  <button
                    onClick={() => void close(event)}
                    disabled={working === `event-${event.externalId}`}
                  >
                    Close event
                  </button>
                </>
              )}
              {(event.status === "PUBLISHED" || event.status === "CLOSED") && (
                <>
                  <button type="button" onClick={() => void loadComments(event.externalId)}>
                    Review condolences
                  </button>
                  {comments[event.externalId]?.map((comment) => (
                    <div className="comment" key={comment.externalId}>
                      <strong>{comment.authorName}</strong>
                      <p>{comment.body}</p>
                      <button
                        onClick={() => void moderateComment(event.externalId, comment.externalId)}
                        disabled={working === `comment-${comment.externalId}`}
                      >
                        Moderate comment
                      </button>
                    </div>
                  ))}
                </>
              )}
            </section>
          ))
        ) : (
          <p>No approved or published Death Support Events are awaiting management.</p>
        )}
      </article>
    </>
  );
}
