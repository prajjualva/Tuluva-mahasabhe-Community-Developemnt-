"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { readRecord } from "../components/read-record";
import { AdminMemberFinancialRecords, recordStatusLabel } from "./member-financial-records";
import type { CoordinatorAppointmentState } from "../../domain/coordinator-appointment";

type Member = {
  externalId: string;
  fullName: string;
  status: string;
  joinedAt: string;
  user: {
    externalId: string;
    email: string | null;
    mobile: string | null;
    roles?: {
      active: boolean;
      role: { code: string; permissions: { permission: { code: string } }[] };
    }[];
  };
  coordinator: { externalId: string; referralCode: string; member: { fullName: string } } | null;
};
type Detail = Member & {
  coordinatorAppointment: CoordinatorAppointmentState;
  address: string;
  memberships: { status: string; startedAt: string; endedAt: string | null }[];
  plans: { externalId: string; status: string; waitingEndsAt: string | null }[];
  dues: {
    externalId: string;
    amountPaise: number;
    purpose: string;
    status: string;
    dueAt: string;
  }[];
  payments: {
    externalId: string;
    amountPaise: number;
    method: string;
    status: string;
    createdAt: string;
    due: { purpose: string; status: string } | null;
    receipt: { receiptNumber: string } | null;
  }[];
  wallet: {
    balancePaise: number;
    transactions: {
      direction: string;
      amountPaise: number;
      balanceAfterPaise: number;
      purpose: string;
      createdAt: string;
    }[];
  } | null;
  nominees: {
    externalId: string;
    fullName: string;
    kind: string;
    relationship: string;
    status: string;
    isCurrent: boolean;
    documents: {
      externalId: string;
      originalFilename: string | null;
      contentType: string;
      uploadedAt: string;
    }[];
  }[];
  transfers: {
    effectiveAt: string;
    reason: string;
    fromCoordinator: { fullName: string; externalId: string } | null;
    toCoordinator: { fullName: string; externalId: string } | null;
    actor: { name: string; externalId: string } | null;
  }[];
  deathCases: {
    externalId: string;
    status: string;
    documents: { externalId: string; originalFilename: string }[];
  }[];
};
type Coordinator = {
  externalId: string;
  status: string;
  member: { fullName: string };
  referralCode: string;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);
export function AdminMemberManagement() {
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState({ search: "", status: "" });
  const [message, setMessage] = useState("");
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [busy, setBusy] = useState(false);
  const [appointmentMessage, setAppointmentMessage] = useState("");
  const appointmentKey = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [choicesStatus, setChoicesStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const searchSequence = useRef(0);
  const commandLock = useRef(false);
  const load = useCallback(async () => {
    const sequence = ++searchSequence.current;
    setLoading(true);
    setUnavailable(false);
    setMembers([]);
    setTotal(0);
    setDetail(null);
    const params = new URLSearchParams({ page: String(page), search: query.search });
    if (query.status) params.set("status", query.status);
    const response = await readRecord<{ members: Member[]; total: number }>(
      `/api/admin/members?${params}`,
    );
    if (sequence !== searchSequence.current) return;
    if (response.ok) {
      setMembers(response.data.members);
      setTotal(response.data.total);
    } else setUnavailable(true);
    setLoading(false);
  }, [page, query]);
  useEffect(() => {
    void load();
    return () => {
      searchSequence.current += 1;
    };
  }, [load]);
  const loadCoordinators = useCallback(async () => {
    setChoicesStatus("loading");
    const response = await readRecord<{ coordinators: Coordinator[] }>("/api/admin/coordinators");
    setCoordinators(response.ok ? response.data.coordinators : []);
    setChoicesStatus(response.ok ? "ready" : "unavailable");
  }, []);
  useEffect(() => {
    void loadCoordinators();
  }, [loadCoordinators]);
  const open = async (id: string, refresh = false) => {
    if (!refresh && commandLock.current) return;
    if (!refresh) {
      setAppointmentMessage("");
      appointmentKey.current = null;
      commandLock.current = true;
      setBusy(true);
    }
    setDetail(null);
    try {
      const response = await readRecord<Detail>(`/api/admin/members/${id}`);
      if (response.ok) setDetail(response.data);
      else setMessage("This member profile is unavailable. Retry opening it or sign in again.");
    } finally {
      if (!refresh) {
        commandLock.current = false;
        setBusy(false);
      }
    }
  };
  const command = async (
    event: FormEvent<HTMLFormElement>,
    path: string,
    payload: (form: FormData) => unknown,
  ) => {
    event.preventDefault();
    if (commandLock.current) return;
    const form = new FormData(event.currentTarget);
    const isAppointment = path === "/api/admin/coordinators";
    if (isAppointment) setAppointmentMessage("Checking payment status and applying appointment…");
    commandLock.current = true;
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload(form)),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Action denied");
      if (isAppointment)
        setAppointmentMessage(
          "Coordinator appointed. Access and unpaid-fee exemptions were applied together.",
        );
      else setMessage("Change saved with Admin identity, timestamp and reason.");
      await load();
      if (detail) await open(detail.externalId, true);
    } catch (error) {
      const feedback = error instanceof Error ? error.message : "Change failed";
      if (isAppointment) setAppointmentMessage(feedback);
      else setMessage(feedback);
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  };
  return (
    <section>
      <h2>Member management</h2>
      <p role="status">{message}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (commandLock.current) return;
          const form = new FormData(event.currentTarget);
          setPage(1);
          setQuery({
            search: String(form.get("search") ?? ""),
            status: String(form.get("status") ?? ""),
          });
        }}
      >
        <label>
          Find by name, email, mobile or member reference
          <input name="search" maxLength={160} />
        </label>
        <label>
          Membership status
          <select name="status">
            <option value="">All statuses</option>
            {["ACTIVE", "GRACE", "INACTIVE", "CLOSED", "DECEASED"].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <button disabled={busy}>Find members</button>
      </form>
      {loading ? (
        <p role="status">Loading members…</p>
      ) : unavailable ? (
        <p role="status">
          Member records are unavailable. Check your connection or sign in again.{" "}
          <button disabled={busy} onClick={() => void load()}>
            Retry loading members
          </button>
        </p>
      ) : (
        <p>{total} members found</p>
      )}
      {!loading && !unavailable && !members.length && <p>No members match these filters.</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Status / Coordinator</th>
              <th>Profile</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.externalId}>
                <td>
                  {member.fullName}
                  <br />
                  {member.user.email}
                  <br />
                  {member.user.mobile}
                </td>
                <td>
                  {member.status}
                  <br />
                  {member.coordinator?.member.fullName ?? "Foundation Admin"}
                </td>
                <td>
                  <button disabled={busy} onClick={() => void open(member.externalId)}>
                    Open member
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        disabled={busy || loading || unavailable || page === 1}
        onClick={() => setPage((value) => value - 1)}
      >
        Previous members
      </button>
      <span> Page {page} </span>
      <button
        disabled={busy || loading || unavailable || page * 30 >= total}
        onClick={() => setPage((value) => value + 1)}
      >
        Next members
      </button>
      {detail && (
        <article className="admin-member-profile">
          <div className="member-profile-heading">
            <div>
              <p className="eyebrow">Member profile</p>
              <h3>{detail.fullName}</h3>
              <span className="member-record-status" data-status={detail.status}>
                {recordStatusLabel(detail.status)}
              </span>
            </div>
            <button className="secondary" onClick={() => setDetail(null)}>
              Close profile
            </button>
          </div>
          <details className="member-record-reference">
            <summary>Member reference</summary>
            <code>{detail.externalId}</code>
          </details>
          <p>{detail.address}</p>
          <p>
            {detail.user.email} · {detail.user.mobile}
          </p>
          <details open>
            <summary>Membership and plan history</summary>
            {detail.status === "CLOSED" && (
              <form
                onSubmit={(event) =>
                  void command(event, `/api/admin/members/${detail.externalId}/reopen`, (form) => ({
                    reason: form.get("reason"),
                  }))
                }
              >
                <p>
                  Reopen with the same member ID and wallet. Old unpaid dues will be cancelled; the
                  new registration starts a new waiting period. Coordinator fee exemptions are
                  preserved.
                </p>
                <label>
                  Admin reopening reason
                  <textarea name="reason" minLength={3} maxLength={1000} required />
                </label>
                <button disabled={busy}>Reopen membership</button>
              </form>
            )}
            {detail.memberships.map((row, index) => (
              <p key={index}>
                {row.status} · {new Date(row.startedAt).toLocaleDateString("en-IN")} →{" "}
                {row.endedAt ? new Date(row.endedAt).toLocaleDateString("en-IN") : "Current"}
              </p>
            ))}
            {detail.plans.map((plan) => (
              <p key={plan.externalId}>
                Community Support Plan · {recordStatusLabel(plan.status)}
                {plan.waitingEndsAt
                  ? ` · Initial waiting ends ${new Date(plan.waitingEndsAt).toLocaleDateString("en-IN")}`
                  : ""}
              </p>
            ))}
          </details>
          <details>
            <summary>Dues, payments and receipts</summary>
            <AdminMemberFinancialRecords dues={detail.dues} payments={detail.payments} />
          </details>
          <details>
            <summary>Wallet and relevant activity</summary>
            <p>Balance: {money(detail.wallet?.balancePaise ?? 0)}</p>
            {detail.wallet?.transactions.map((row, index) => (
              <p key={index}>
                {new Date(row.createdAt).toLocaleString("en-IN")} · {row.direction}{" "}
                {money(row.amountPaise)} · {row.purpose} · Balance {money(row.balanceAfterPaise)}
              </p>
            ))}
          </details>
          <details>
            <summary>Nominees and documents</summary>
            {detail.nominees.map((nominee) => (
              <section key={nominee.externalId}>
                <p>
                  {nominee.fullName} · {nominee.relationship} · {nominee.kind} · {nominee.status} ·{" "}
                  {nominee.isCurrent ? "Current" : "Pending / historical"} ·{" "}
                  {nominee.documents.length} documents
                </p>
                {nominee.documents.map((document) => (
                  <p key={document.externalId}>
                    <a
                      href={`/api/admin/nominees/${nominee.externalId}/documents/${document.externalId}/download`}
                    >
                      {document.originalFilename ?? "Restricted nominee evidence"}
                    </a>{" "}
                    · {new Date(document.uploadedAt).toLocaleDateString("en-IN")}
                  </p>
                ))}
              </section>
            ))}
            {detail.deathCases.map((deathCase) => (
              <section key={deathCase.externalId}>
                <p>
                  Death report: {deathCase.externalId} · {deathCase.status}
                </p>
                {deathCase.documents.map((document) => (
                  <p key={document.externalId}>
                    <a
                      href={`/api/admin/death-reports/${deathCase.externalId}/documents/${document.externalId}/download`}
                    >
                      {document.originalFilename}
                    </a>
                  </p>
                ))}
              </section>
            ))}
          </details>
          <details>
            <summary>Coordinator assignment and transfer history</summary>
            <p>Current: {detail.coordinator?.member.fullName ?? "Foundation Admin"}</p>
            {detail.transfers.map((row, index) => (
              <p key={index}>
                {new Date(row.effectiveAt).toLocaleString("en-IN")} · {row.reason}
                <br />
                {row.fromCoordinator?.fullName ?? "Foundation Admin"} →{" "}
                {row.toCoordinator?.fullName ?? "Foundation Admin"}
                <br />
                Recorded by: {row.actor ? `${row.actor.name} (${row.actor.externalId})` : "System"}
              </p>
            ))}
            <form
              onSubmit={(event) =>
                void command(
                  event,
                  `/api/admin/members/${detail.externalId}/coordinator`,
                  (form) => ({
                    replacementCoordinatorId: form.get("coordinator"),
                    reason: form.get("reason"),
                  }),
                )
              }
            >
              <label>
                Assign / transfer to
                <select name="coordinator" required disabled={busy || choicesStatus !== "ready"}>
                  <option value="">Choose active Coordinator</option>
                  {coordinators
                    .filter((row) => row.status === "ACTIVE")
                    .map((row) => (
                      <option key={row.externalId} value={row.externalId}>
                        {row.member.fullName} · {row.referralCode}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Reason
                <textarea name="reason" minLength={3} maxLength={1000} required />
              </label>
              {choicesStatus === "loading" && <p role="status">Loading active Coordinators…</p>}
              {choicesStatus === "unavailable" && (
                <p role="status">
                  Coordinator choices are unavailable.{" "}
                  <button type="button" disabled={busy} onClick={() => void loadCoordinators()}>
                    Retry Coordinator choices
                  </button>
                </p>
              )}
              <button disabled={busy || choicesStatus !== "ready"}>Save assignment</button>
            </form>
          </details>
          <details>
            <summary>Appoint as Coordinator</summary>
            <p>{detail.coordinatorAppointment.message}</p>
            {detail.coordinatorAppointment.canAppoint && (
              <form
                onSubmit={(event) =>
                  void command(event, "/api/admin/coordinators", (form) => ({
                    memberExternalId: detail.externalId,
                    referralCode: form.get("referral"),
                    reason: form.get("reason"),
                    applyFeeExemption: form.get("feeExemption") === "on",
                    idempotencyKey:
                      appointmentKey.current ?? (appointmentKey.current = crypto.randomUUID()),
                  }))
                }
              >
                <label>
                  Referral code
                  <input
                    name="referral"
                    pattern="[A-Za-z0-9]{6,16}"
                    minLength={6}
                    maxLength={16}
                    required
                  />
                  <small>6–16 letters or numbers. This code is permanent.</small>
                </label>
                <label>
                  Appointment reason
                  <textarea name="reason" minLength={3} maxLength={1000} required />
                </label>
                <label className="consent-label">
                  <input type="checkbox" name="feeExemption" required />
                  <span>
                    Apply the Coordinator exemption to unpaid membership and Community Support Plan
                    registration fees.
                  </span>
                </label>
                <p className="member-record-note">
                  Paid fees remain recorded and are not refunded. Event contributions remain
                  payable. Coordinator access is granted automatically with appointment.
                </p>
                <button disabled={busy}>
                  {busy ? "Checking and appointing…" : "Exempt fees & appoint Coordinator"}
                </button>
              </form>
            )}
            <p role="status" className="member-action-feedback">
              {appointmentMessage}
            </p>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void open(detail.externalId, true)}
            >
              Refresh appointment status
            </button>
          </details>
          <details>
            <summary>Account access</summary>
            {detail.user.roles?.map((assignment) => (
              <p key={assignment.role.code}>
                {recordStatusLabel(assignment.role.code)} ·{" "}
                {assignment.active ? "Enabled" : "Disabled"}
              </p>
            ))}
            <p>
              Coordinator permissions are granted by appointment. Use Coordinator management for
              suspension or restoration.
            </p>
            <a href="#coordinators">Manage Coordinators →</a>
            <p>
              <a href="#access">Advanced account access →</a>
            </p>
          </details>
        </article>
      )}
    </section>
  );
}
