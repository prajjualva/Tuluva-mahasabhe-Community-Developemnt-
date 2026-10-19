"use client";
import { RestrictedBankReview } from "../components/restricted-bank-review";

import { useCallback, useEffect, useState } from "react";

type Readiness = {
  eventVerified: boolean;
  eventPublished: boolean;
  deathDateVerified: boolean;
  eligible: boolean;
  requiredDocumentsComplete: boolean;
  nomineeVerified: boolean;
  nomineeBankVerified: boolean;
  disputeOpen: boolean;
  missing: string[];
};

type Nominee = {
  externalId: string;
  fullName: string;
  relationship: string;
  kind: string;
  status: string;
  isCurrent: boolean;
  hasVerifiedBankDetails: boolean;
  documentCount: number;
};

type DeathDocument = {
  externalId: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  verifiedAt: string | null;
};

type Payment = {
  externalId: string;
  amountPaise: number;
  status: string;
  method: string;
  providerName: string | null;
  providerReference: string | null;
  failureReason: string | null;
  initiatedAt: string;
  settledAt: string | null;
};

type Dispute = {
  externalId: string;
  status: string;
  reason: string;
  openedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
};

type SupportCase = {
  externalId: string;
  status: string;
  amountPaise: number;
  createdAt: string;
  exceptionReason: string | null;
  nomineeSelectionReason: string | null;
  readiness: Readiness;
  deathCase: {
    externalId: string;
    dateOfDeath: string;
    placeOfDeath: string;
    eligibilityStatus: string;
    eligibilityReason: string | null;
    member: { externalId: string; fullName: string; status: string } | null;
    event: { externalId: string; status: string; publishedAt: string | null } | null;
  };
  nominees: Nominee[];
  nominee: Nominee | null;
  documents: DeathDocument[];
  payment: Payment | null;
  dispute: Dispute | null;
};

type ApiMessage = { error?: string; message?: string; outcome?: string };

const terminalStatuses = new Set(["PAID", "REJECTED"]);
const label = (value: string) => value.replaceAll("_", " ");
const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "Not recorded";
const amount = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

/**
 * Admin-only review queue. Every button calls a protected, persistent API;
 * neither bank-account material nor opaque document-storage keys reach this UI.
 */
export function AdminSupportPaymentQueue() {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [nominees, setNominees] = useState<Record<string, string>>({});
  const [resolution, setResolution] = useState<Record<string, "RESUME" | "REJECT">>({});

  const value = (caseId: string, field: string) => inputs[`${caseId}:${field}`] ?? "";
  const setValue = (caseId: string, field: string, next: string) =>
    setInputs((current) => ({ ...current, [`${caseId}:${field}`]: next }));

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/support-cases", { cache: "no-store" });
      const data = (await response.json()) as { cases?: SupportCase[]; error?: string };
      if (!response.ok) {
        setMessage(data.error ?? "Sign in as an Administrator to view this queue.");
        return;
      }
      setCases(data.cases ?? []);
    } catch {
      setMessage("The support-payment queue is temporarily unavailable.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (
    action: string,
    endpoint: string,
    body: Record<string, unknown>,
    success: string,
  ) => {
    setWorking(action);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as ApiMessage;
      if (!response.ok) {
        setMessage(data.error ?? "The request was denied.");
        return;
      }
      setMessage(data.message ?? data.outcome ?? success);
      await load();
    } catch {
      setMessage("The request could not be completed. Please try again.");
    } finally {
      setWorking(null);
    }
  };

  const requireReason = (caseId: string, field: string, prompt: string) => {
    const reason = value(caseId, field).trim();
    if (reason.length < 3) {
      setMessage(prompt);
      return null;
    }
    return reason;
  };

  const chooseNominee = async (supportCase: SupportCase) => {
    const nomineeExternalId = nominees[supportCase.externalId] ?? supportCase.nominee?.externalId;
    const nominee = supportCase.nominees.find((item) => item.externalId === nomineeExternalId);
    if (
      !nominee ||
      !nominee.isCurrent ||
      nominee.status !== "VERIFIED" ||
      !nominee.hasVerifiedBankDetails
    ) {
      setMessage("Select a current, verified nominee whose bank details have been verified.");
      return;
    }
    const selectionReason = value(supportCase.externalId, "nominee").trim();
    if (nominee.kind !== "PRIMARY" && selectionReason.length < 3) {
      setMessage(
        "Explain why the Primary nominee is unavailable before selecting another nominee.",
      );
      return;
    }
    await post(
      `nominee:${supportCase.externalId}`,
      `/api/admin/support-cases/${encodeURIComponent(supportCase.externalId)}/nominee`,
      { nomineeExternalId, selectionReason: selectionReason || undefined },
      "Verified nominee recorded.",
    );
  };

  const verifyDocuments = async (supportCase: SupportCase) => {
    const reason = requireReason(
      supportCase.externalId,
      "documents",
      "Enter an evidence-review reason before recording verification.",
    );
    if (!reason) return;
    const documentExternalIds = supportCase.documents.map((document) => document.externalId);
    if (!documentExternalIds.length) {
      setMessage("At least one restricted death-evidence document is required.");
      return;
    }
    await post(
      `documents:${supportCase.externalId}`,
      `/api/admin/support-cases/${encodeURIComponent(supportCase.externalId)}/documents/verify`,
      { documentExternalIds, reason },
      "All attached evidence documents were verified and audited.",
    );
  };

  const settle = async (supportCase: SupportCase, outcome: "SUCCEEDED" | "FAILED") => {
    const payment = supportCase.payment;
    if (!payment || payment.status !== "PENDING") return;
    const providerReference = requireReason(
      supportCase.externalId,
      "transfer-reference",
      "Enter the genuine bank-transfer reference first.",
    );
    if (!providerReference) return;
    await post(
      `outcome:${payment.externalId}`,
      `/api/admin/support-payments/${encodeURIComponent(payment.externalId)}/outcome`,
      { providerReference, outcome },
      outcome === "SUCCEEDED"
        ? "Confirmed transfer and Foundation ledger debit recorded."
        : "Transfer failure recorded. A later retry needs an explicit Admin action.",
    );
  };

  return (
    <article>
      <h2>₹1,00,000 Community Support payments</h2>
      <p>
        The Foundation may pay an eligible case before every ₹100 contribution is collected. Each
        action is rechecked on the server against eligibility, documents, nominee and bank status,
        disputes, and the fixed payout amount.
      </p>
      {message && <p role="status">{message}</p>}
      {cases.length === 0 ? (
        <p>No Community Support cases are awaiting Administrator action.</p>
      ) : (
        cases.map((supportCase) => {
          const payment = supportCase.payment;
          const frozen =
            supportCase.status === "FROZEN_DISPUTE" ||
            supportCase.dispute?.status === "OPEN" ||
            supportCase.readiness.disputeOpen;
          const terminal = terminalStatuses.has(supportCase.status);
          const selectedNominee =
            nominees[supportCase.externalId] ?? supportCase.nominee?.externalId ?? "";
          const canApprove = supportCase.status === "REVIEW" && !frozen && !terminal;
          const canInitiate = supportCase.status === "APPROVED" && !payment && !frozen;

          return (
            <section className="queue-item" key={supportCase.externalId}>
              <strong>{supportCase.deathCase.member?.fullName ?? "Unlinked member"}</strong>
              <p>
                Support case {supportCase.externalId} · {amount(supportCase.amountPaise)} ·{" "}
                {label(supportCase.status)}
              </p>
              <p>
                Death: {dateTime(supportCase.deathCase.dateOfDeath)} ·{" "}
                {supportCase.deathCase.placeOfDeath}
              </p>
              <p>
                Event:{" "}
                {supportCase.deathCase.event
                  ? label(supportCase.deathCase.event.status)
                  : "not published"}{" "}
                · Eligibility: {label(supportCase.deathCase.eligibilityStatus)}
              </p>
              {supportCase.deathCase.eligibilityReason && (
                <p>{supportCase.deathCase.eligibilityReason}</p>
              )}
              {supportCase.exceptionReason && (
                <p>Admin review note: {supportCase.exceptionReason}</p>
              )}

              <div className="support-readiness">
                <strong>Readiness</strong>
                <ul>
                  <li>
                    Verified/published event:{" "}
                    {supportCase.readiness.eventVerified && supportCase.readiness.eventPublished
                      ? "ready"
                      : "needs review"}
                  </li>
                  <li>
                    Verified death date:{" "}
                    {supportCase.readiness.deathDateVerified ? "ready" : "needs review"}
                  </li>
                  <li>
                    Eligibility: {supportCase.readiness.eligible ? "eligible" : "not eligible"}
                  </li>
                  <li>
                    Required evidence:{" "}
                    {supportCase.readiness.requiredDocumentsComplete ? "ready" : "needs review"}
                  </li>
                  <li>
                    Nominee and verified bank:{" "}
                    {supportCase.readiness.nomineeVerified &&
                    supportCase.readiness.nomineeBankVerified
                      ? "ready"
                      : "needs review"}
                  </li>
                  <li>Nominee dispute: {frozen ? "PAYOUT FROZEN" : "none open"}</li>
                </ul>
                {supportCase.readiness.missing.length > 0 && (
                  <p className="warning">
                    Still required: {supportCase.readiness.missing.join(", ")}
                  </p>
                )}
              </div>

              {!terminal && !frozen && (
                <>
                  <div className="support-action-panel">
                    <label>
                      Verified nominee for payout
                      <select
                        value={selectedNominee}
                        disabled={working !== null}
                        onChange={(event) =>
                          setNominees((current) => ({
                            ...current,
                            [supportCase.externalId]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select a verified nominee</option>
                        {supportCase.nominees.map((nominee) => (
                          <option
                            key={nominee.externalId}
                            value={nominee.externalId}
                            disabled={
                              !nominee.isCurrent ||
                              nominee.status !== "VERIFIED" ||
                              !nominee.hasVerifiedBankDetails
                            }
                          >
                            {nominee.fullName} · {nominee.kind} · {nominee.status}
                            {nominee.hasVerifiedBankDetails
                              ? " · bank verified"
                              : " · bank needs verification"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Reason if selecting Secondary or Backup nominee
                      <textarea
                        value={value(supportCase.externalId, "nominee")}
                        onChange={(event) =>
                          setValue(supportCase.externalId, "nominee", event.target.value)
                        }
                        maxLength={1000}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={working !== null}
                      onClick={() => void chooseNominee(supportCase)}
                    >
                      Confirm nominee and verified bank
                    </button>
                    {nominees[supportCase.externalId] && (
                      <RestrictedBankReview
                        key={nominees[supportCase.externalId]}
                        nomineeExternalId={nominees[supportCase.externalId]}
                      />
                    )}
                  </div>

                  <div className="support-action-panel">
                    <strong>Restricted evidence review</strong>
                    {supportCase.documents.length ? (
                      <ul>
                        {supportCase.documents.map((document) => (
                          <li key={document.externalId}>
                            {document.originalFilename} · {document.contentType} ·{" "}
                            {document.sizeBytes} bytes ·{" "}
                            {document.verifiedAt
                              ? `verified ${dateTime(document.verifiedAt)}`
                              : "not verified"}{" "}
                            <a
                              href={`/api/admin/death-reports/${encodeURIComponent(supportCase.deathCase.externalId)}/documents/${encodeURIComponent(document.externalId)}/download`}
                            >
                              Review restricted evidence
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="warning">No restricted death-evidence document is attached.</p>
                    )}
                    <label>
                      Evidence verification reason
                      <textarea
                        value={value(supportCase.externalId, "documents")}
                        onChange={(event) =>
                          setValue(supportCase.externalId, "documents", event.target.value)
                        }
                        maxLength={1000}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={working !== null || supportCase.documents.length === 0}
                      onClick={() => void verifyDocuments(supportCase)}
                    >
                      Verify all attached evidence
                    </button>
                  </div>
                </>
              )}

              {frozen ? (
                <div className="support-action-panel">
                  <strong>Nominee dispute is freezing this payout</strong>
                  <label>
                    Resolution
                    <select
                      value={resolution[supportCase.externalId] ?? "RESUME"}
                      disabled={working !== null}
                      onChange={(event) =>
                        setResolution((current) => ({
                          ...current,
                          [supportCase.externalId]: event.target.value as "RESUME" | "REJECT",
                        }))
                      }
                    >
                      <option value="RESUME">Resolve and resume review</option>
                      <option value="REJECT">Resolve by rejecting the support case</option>
                    </select>
                  </label>
                  <label>
                    Resolution reason
                    <textarea
                      value={value(supportCase.externalId, "resolve")}
                      onChange={(event) =>
                        setValue(supportCase.externalId, "resolve", event.target.value)
                      }
                      maxLength={1000}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={working !== null}
                    onClick={() => {
                      const reason = requireReason(
                        supportCase.externalId,
                        "resolve",
                        "Enter a nominee-dispute resolution reason.",
                      );
                      if (!reason) return;
                      void post(
                        `resolve:${supportCase.externalId}`,
                        `/api/admin/support-cases/${encodeURIComponent(supportCase.externalId)}/dispute`,
                        {
                          action: "RESOLVE",
                          resolution: resolution[supportCase.externalId] ?? "RESUME",
                          reason,
                          nomineeExternalId: nominees[supportCase.externalId] || undefined,
                          selectionReason:
                            value(supportCase.externalId, "nominee").trim() || undefined,
                        },
                        "Nominee dispute resolution recorded.",
                      );
                    }}
                  >
                    Resolve nominee dispute
                  </button>
                </div>
              ) : (
                !terminal && (
                  <div className="support-action-panel">
                    <label>
                      Nominee-dispute reason
                      <textarea
                        value={value(supportCase.externalId, "dispute")}
                        onChange={(event) =>
                          setValue(supportCase.externalId, "dispute", event.target.value)
                        }
                        maxLength={1000}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={working !== null}
                      onClick={() => {
                        const reason = requireReason(
                          supportCase.externalId,
                          "dispute",
                          "Enter a nominee-dispute reason to freeze payout.",
                        );
                        if (reason)
                          void post(
                            `dispute:${supportCase.externalId}`,
                            `/api/admin/support-cases/${encodeURIComponent(supportCase.externalId)}/dispute`,
                            { action: "OPEN", reason },
                            "Nominee dispute recorded; payout frozen.",
                          );
                      }}
                    >
                      Freeze payout for nominee dispute
                    </button>
                  </div>
                )
              )}

              {canApprove && (
                <div className="support-action-panel">
                  <label>
                    Final approval note (optional)
                    <textarea
                      value={value(supportCase.externalId, "approve")}
                      onChange={(event) =>
                        setValue(supportCase.externalId, "approve", event.target.value)
                      }
                      maxLength={1000}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={working !== null}
                    onClick={() =>
                      void post(
                        `approve:${supportCase.externalId}`,
                        `/api/admin/support-cases/${encodeURIComponent(supportCase.externalId)}/approve`,
                        { reason: value(supportCase.externalId, "approve").trim() || undefined },
                        "Final Admin approval recorded.",
                      )
                    }
                  >
                    Grant final Admin approval
                  </button>
                </div>
              )}

              {!terminal && !frozen && (
                <div className="support-action-panel">
                  <label>
                    Rejection reason
                    <textarea
                      value={value(supportCase.externalId, "reject")}
                      onChange={(event) =>
                        setValue(supportCase.externalId, "reject", event.target.value)
                      }
                      maxLength={1000}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={working !== null}
                    onClick={() => {
                      const reason = requireReason(
                        supportCase.externalId,
                        "reject",
                        "A rejection reason is required.",
                      );
                      if (reason)
                        void post(
                          `reject:${supportCase.externalId}`,
                          `/api/admin/support-cases/${encodeURIComponent(supportCase.externalId)}/reject`,
                          { reason },
                          "Support case rejected and audited.",
                        );
                    }}
                  >
                    Reject support case
                  </button>
                </div>
              )}

              <div className="support-action-panel">
                <strong>Payment settlement</strong>
                {payment ? (
                  <p>
                    {amount(payment.amountPaise)} · {label(payment.status)} · initiated{" "}
                    {dateTime(payment.initiatedAt)}
                    {payment.providerReference ? ` · reference ${payment.providerReference}` : ""}
                    {payment.failureReason ? ` · ${payment.failureReason}` : ""}
                  </p>
                ) : (
                  <p>No payout attempt has been initiated.</p>
                )}
                {canInitiate && (
                  <button
                    type="button"
                    disabled={working !== null}
                    onClick={() =>
                      void post(
                        `initiate:${supportCase.externalId}`,
                        `/api/admin/support-cases/${encodeURIComponent(supportCase.externalId)}/payments/initiate`,
                        { idempotencyKey: crypto.randomUUID() },
                        "Payout command persisted; a genuine transfer outcome is still required.",
                      )
                    }
                  >
                    Initiate ₹1,00,000 payment
                  </button>
                )}
                {payment?.status === "FAILED" && !terminal && !frozen && (
                  <button
                    type="button"
                    disabled={working !== null}
                    onClick={() =>
                      void post(
                        `retry:${supportCase.externalId}`,
                        `/api/admin/support-cases/${encodeURIComponent(supportCase.externalId)}/payments/retry`,
                        { idempotencyKey: crypto.randomUUID() },
                        "Fresh manual retry command persisted.",
                      )
                    }
                  >
                    Manually retry failed payment
                  </button>
                )}
                {payment?.status === "PENDING" && !terminal && !frozen && (
                  <>
                    <label>
                      Genuine bank-transfer reference
                      <input
                        value={value(supportCase.externalId, "transfer-reference")}
                        onChange={(event) =>
                          setValue(supportCase.externalId, "transfer-reference", event.target.value)
                        }
                        maxLength={200}
                      />
                    </label>
                    <p className="warning">
                      Record an outcome only after a real verified-bank transfer. This does not
                      simulate a payout.
                    </p>
                    <button
                      type="button"
                      disabled={working !== null}
                      onClick={() => void settle(supportCase, "SUCCEEDED")}
                    >
                      Record confirmed transfer
                    </button>
                    <button
                      type="button"
                      disabled={working !== null}
                      onClick={() => void settle(supportCase, "FAILED")}
                    >
                      Record transfer failure
                    </button>
                  </>
                )}
              </div>
            </section>
          );
        })
      )}
    </article>
  );
}
