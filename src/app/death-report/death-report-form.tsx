"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";

type MemberSearchResult = {
  externalId: string;
  fullName: string;
  mobile: string | null;
  email: string | null;
  address: string;
  status: string;
  existingEventExternalId: string | null;
  hasOpenDeathReport: boolean;
  inWaitingPeriod: boolean;
};

type ReportResult = {
  outcome?: "CREATED" | "MEMBER_NOT_FOUND" | "DUPLICATE";
  case?: { externalId: string; status: string; requiresAdminReview?: boolean };
  reportAccessToken?: string;
  documents?: UploadedDocument[];
  warning?: string;
  existingEventExternalId?: string | null;
  message?: string;
  error?: string;
};

type UploadedDocument = {
  externalId: string;
  contentType: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
};

type SearchState = "IDLE" | "FOUND" | "NOT_FOUND" | "AUTH_REQUIRED" | "ERROR";

const dateToday = () => new Date().toISOString().slice(0, 10);

/**
 * The server owns all report state decisions. This component only collects the
 * required public reporting details and renders the safe search DTO supplied by
 * the report API.
 */
export function DeathReportForm() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("IDLE");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [message, setMessage] = useState("");
  const [reportAccessToken, setReportAccessToken] = useState("");
  const [submittedCaseExternalId, setSubmittedCaseExternalId] = useState("");
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [duplicateEventExternalId, setDuplicateEventExternalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const additionalDocumentRef = useRef<HTMLInputElement>(null);

  const selectedMember = results.find((member) => member.externalId === selectedMemberId) ?? null;

  const search = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setMessage("Enter at least two characters to search for a member.");
      return;
    }
    setBusy(true);
    setMessage("");
    setSelectedMemberId("");
    setDuplicateEventExternalId(null);
    try {
      const response = await fetch(
        `/api/death-reports/members?query=${encodeURIComponent(trimmed)}`,
      );
      const data = (await response.json()) as { members?: MemberSearchResult[]; error?: string };
      if (!response.ok) {
        setResults([]);
        if (response.status === 401 || response.status === 403) {
          // Contact details are intentionally protected from public enumeration.
          // Anyone may still file an unlinked Member Not Found report for Admin review.
          setSearchState("AUTH_REQUIRED");
          setMessage("");
          return;
        }
        setSearchState("ERROR");
        setMessage(data.error ?? "Member search is temporarily unavailable.");
        return;
      }
      setResults(data.members ?? []);
      setSearchState((data.members ?? []).length ? "FOUND" : "NOT_FOUND");
      if ((data.members ?? []).length === 0)
        setMessage(
          "No member was found. You can send this report to the Administrator for review.",
        );
    } catch {
      setSearchState("ERROR");
      setMessage("Member search is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (searchState === "IDLE" || searchState === "ERROR") {
      setMessage("Search for the member before submitting this report.");
      return;
    }
    if (searchState === "FOUND" && !selectedMemberId) {
      setMessage("Select the existing member this report concerns.");
      return;
    }

    setBusy(true);
    setMessage("");
    setReportAccessToken("");
    setSubmittedCaseExternalId("");
    setUploadedDocuments([]);
    setDuplicateEventExternalId(null);
    try {
      const form = new FormData(event.currentTarget);
      if (selectedMemberId) form.set("memberExternalId", selectedMemberId);
      form.set("searchedMemberFound", String(Boolean(selectedMemberId)));
      const response = await fetch("/api/death-reports", { method: "POST", body: form });
      const data = (await response.json()) as ReportResult;
      if (!response.ok) {
        if (data.outcome === "DUPLICATE") {
          setDuplicateEventExternalId(data.existingEventExternalId ?? null);
          setMessage(data.warning ?? "A matching death report or event already exists.");
          return;
        }
        setMessage(data.error ?? "The death report could not be submitted.");
        return;
      }
      const report = data.case;
      setReportAccessToken(data.reportAccessToken ?? "");
      setSubmittedCaseExternalId(report?.externalId ?? "");
      setUploadedDocuments(data.documents ?? []);
      setMessage(
        report
          ? `Report ${report.externalId} submitted for ${report.status.replaceAll("_", " ")}${
              report.requiresAdminReview ? "; it requires Administrator review" : ""
            }.`
          : (data.message ?? "Death report submitted for review."),
      );
      formRef.current?.reset();
      setResults([]);
      setSelectedMemberId("");
      setSearchState("IDLE");
      setQuery("");
    } catch {
      setMessage("The death report could not be submitted. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyReportToken = async () => {
    try {
      await navigator.clipboard.writeText(reportAccessToken);
      setMessage("Private report tracking token copied. Store it safely.");
    } catch {
      setMessage("Copying is unavailable. Select and save the private tracking token manually.");
    }
  };

  const uploadAdditionalEvidence = async () => {
    const file = additionalDocumentRef.current?.files?.[0];
    if (!file || !submittedCaseExternalId || !reportAccessToken) {
      setMessage("Choose one evidence file before uploading.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("document", file);
      const response = await fetch(
        `/api/death-reports/${encodeURIComponent(submittedCaseExternalId)}/documents`,
        {
          method: "POST",
          headers: { "x-death-report-access-token": reportAccessToken },
          body: form,
        },
      );
      const data = (await response.json()) as { document?: UploadedDocument; error?: string };
      if (!response.ok || !data.document) {
        setMessage(data.error ?? "Evidence could not be uploaded.");
        return;
      }
      setUploadedDocuments((current) => [...current, data.document!]);
      if (additionalDocumentRef.current) additionalDocumentRef.current.value = "";
      setMessage("Additional restricted evidence uploaded for Administrator review.");
    } catch {
      setMessage("Evidence could not be uploaded. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form ref={formRef} className="workflow-form" onSubmit={submit} encType="multipart/form-data">
      <fieldset disabled={busy}>
        <legend>Find the member</legend>
        <label>
          Member name
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Start typing a full or partial name"
            minLength={2}
          />
        </label>
        <button type="button" onClick={() => void search()}>
          Search members
        </button>
        {searchState === "FOUND" && results.length > 0 && (
          <div className="selection-list" aria-label="Matching members">
            {results.map((member) => {
              const duplicate =
                member.status === "DECEASED" ||
                member.hasOpenDeathReport ||
                Boolean(member.existingEventExternalId);
              return (
                <label className="selection-card" key={member.externalId}>
                  <input
                    type="radio"
                    name="selectedMember"
                    checked={selectedMemberId === member.externalId}
                    onChange={() => setSelectedMemberId(member.externalId)}
                  />
                  <span>
                    <strong>{member.fullName}</strong> · {member.status}
                    <br />
                    Mobile: {member.mobile ?? "Not recorded"} · Email:{" "}
                    {member.email ?? "Not recorded"}
                    <br />
                    Address: {member.address}
                    {(member.status === "INACTIVE" || member.status === "CLOSED") && (
                      <em>
                        {" "}
                        This membership is {member.status.toLowerCase()} and requires Administrator
                        review.
                      </em>
                    )}
                    {member.inWaitingPeriod && (
                      <em>
                        {" "}
                        This member is in the initial waiting period and requires Admin review.
                      </em>
                    )}
                    {duplicate && (
                      <em>
                        {" "}
                        A death report/event already exists. Do not submit a duplicate.
                        {member.existingEventExternalId && (
                          <>
                            {" "}
                            <Link href={`/death-support-events/${member.existingEventExternalId}`}>
                              View existing Death Support Event
                            </Link>
                          </>
                        )}
                      </em>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {searchState === "NOT_FOUND" && (
          <p>
            The member was not found. The Administrator will review the report and decide whether it
            can be linked to a member record.
          </p>
        )}
        {searchState === "AUTH_REQUIRED" && (
          <p>
            <Link href="/login?next=%2Fdeath-report">Sign in</Link> to search private member contact
            details. If you cannot sign in, you may still submit an unlinked Member Not Found report
            below for Administrator review.
          </p>
        )}
      </fieldset>

      <fieldset disabled={busy}>
        <legend>Report details</legend>
        <label>
          Your name and contact details
          <input
            name="reporterIdentity"
            required
            minLength={2}
            maxLength={300}
            placeholder="For example: Anjali Rao, +91…"
          />
        </label>
        <label>
          Place of death
          <input name="placeOfDeath" required minLength={2} maxLength={200} />
        </label>
        <label>
          Date of death
          <input name="dateOfDeath" type="date" required max={dateToday()} />
        </label>
        <label>
          Additional details (optional)
          <textarea name="details" maxLength={4000} />
        </label>
        <label>
          Supporting documents or photos (optional)
          <input
            name="documents"
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp"
          />
        </label>
        <p className="muted">
          Upload only relevant PDF, JPEG, PNG, or WebP evidence files up to 10 MB each. Documents
          are restricted to authorized reviewers and are never published with nominee, bank,
          password, OTP, or payment information.
        </p>
      </fieldset>

      <button
        type="submit"
        disabled={
          busy ||
          Boolean(
            selectedMember &&
            (selectedMember.status === "DECEASED" ||
              selectedMember.hasOpenDeathReport ||
              selectedMember.existingEventExternalId),
          )
        }
      >
        {busy ? "Submitting…" : "Submit death report"}
      </button>
      {message && <p role="status">{message}</p>}
      {duplicateEventExternalId && (
        <p role="alert">
          <Link href={`/death-support-events/${encodeURIComponent(duplicateEventExternalId)}`}>
            View the existing Death Support Event
          </Link>
        </p>
      )}
      {reportAccessToken && (
        <>
          <section className="private-token" aria-label="Private report tracking token">
            <strong>Save this private report tracking token now</strong>
            <p>
              It is shown only once and should never be shared publicly:{" "}
              <code>{reportAccessToken}</code>
            </p>
            <button type="button" onClick={() => void copyReportToken()}>
              Copy private token
            </button>
          </section>
          <section className="evidence-follow-up" aria-label="Add restricted death report evidence">
            <h2>Add evidence to this report</h2>
            <p>
              This private control uses the report token above. Added files remain restricted to
              authorized reviewers.
            </p>
            <input
              ref={additionalDocumentRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={busy}
            />
            <button type="button" onClick={() => void uploadAdditionalEvidence()} disabled={busy}>
              Upload additional evidence
            </button>
            {uploadedDocuments.length > 0 && (
              <p>{uploadedDocuments.length} evidence file(s) securely attached to this report.</p>
            )}
          </section>
        </>
      )}
    </form>
  );
}
