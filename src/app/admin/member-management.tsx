"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";

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
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), search: query.search });
      if (query.status) params.set("status", query.status);
      const response = await fetch(`/api/admin/members?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Member search failed");
      setMembers(body.members);
      setTotal(body.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Member search failed");
    }
  }, [page, query]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void fetch("/api/admin/coordinators")
      .then(async (response) => {
        if (response.ok) setCoordinators((await response.json()).coordinators);
      })
      .catch(() => setMessage("Coordinator list could not be loaded."));
  }, []);
  const open = async (id: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/members/${id}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Profile unavailable");
      setDetail(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile unavailable");
    } finally {
      setBusy(false);
    }
  };
  const command = async (
    event: FormEvent<HTMLFormElement>,
    path: string,
    payload: (form: FormData) => unknown,
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload(form)),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Action denied");
      setMessage("Change saved with Admin identity, timestamp and reason.");
      await load();
      if (detail) await open(detail.externalId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Change failed");
    } finally {
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
        <button>Find members</button>
      </form>
      <p>{total} members found</p>
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
      <button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
        Previous members
      </button>
      <span> Page {page} </span>
      <button disabled={page * 30 >= total} onClick={() => setPage((value) => value + 1)}>
        Next members
      </button>
      {detail && (
        <article>
          <h3>{detail.fullName}</h3>
          <button onClick={() => setDetail(null)}>Close profile</button>
          <p>
            {detail.externalId} · {detail.status}
          </p>
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
                Plan {plan.externalId} · {plan.status}
                {plan.waitingEndsAt
                  ? ` · Initial waiting ends ${new Date(plan.waitingEndsAt).toLocaleDateString("en-IN")}`
                  : ""}
              </p>
            ))}
          </details>
          <details>
            <summary>Dues, payments and receipts</summary>
            {detail.dues.map((due) => (
              <p key={due.externalId}>
                {due.purpose} · {money(due.amountPaise)} · {due.status} ·{" "}
                {new Date(due.dueAt).toLocaleDateString("en-IN")}
              </p>
            ))}
            {detail.payments.map((payment) => (
              <p key={payment.externalId}>
                {payment.externalId} · {money(payment.amountPaise)} · {payment.method} ·{" "}
                {payment.status}
                <br />
                Receipt:{" "}
                {payment.receipt ? (
                  <a
                    href={`/api/admin/receipts/${encodeURIComponent(payment.receipt.receiptNumber)}/download`}
                  >
                    {payment.receipt.receiptNumber} — download
                  </a>
                ) : (
                  "Not issued"
                )}
              </p>
            ))}
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
                <select name="coordinator" required>
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
              <button disabled={busy}>Save assignment</button>
            </form>
            <form
              onSubmit={(event) =>
                void command(event, "/api/admin/coordinators", (form) => ({
                  memberExternalId: detail.externalId,
                  referralCode: form.get("referral"),
                  reason: form.get("reason"),
                }))
              }
            >
              <h4>Appoint this member as a Coordinator</h4>
              <label>
                Referral code
                <input
                  name="referral"
                  pattern="[A-Za-z0-9]{6,16}"
                  minLength={6}
                  maxLength={16}
                  required
                />
              </label>
              <label>
                Appointment reason
                <textarea name="reason" minLength={3} maxLength={1000} required />
              </label>
              <button disabled={busy}>Appoint Coordinator</button>
            </form>
          </details>
          <details>
            <summary>Roles and permissions</summary>
            {detail.user.roles?.map((assignment) => (
              <p key={assignment.role.code}>
                {assignment.role.code} · {assignment.active ? "Enabled" : "Disabled"}
                <br />
                {assignment.active &&
                  assignment.role.permissions.map((row) => row.permission.code).join(", ")}
              </p>
            ))}
            <form
              onSubmit={(event) =>
                void command(event, `/api/admin/users/${detail.user.externalId}/roles`, (form) => ({
                  roleCode: form.get("role"),
                  active: form.get("active") === "true",
                  reason: form.get("reason"),
                }))
              }
            >
              <label>
                Role
                <select name="role">
                  <option>MEMBER</option>
                  <option>COORDINATOR</option>
                  <option>ADMIN</option>
                </select>
              </label>
              <label>
                Access
                <select name="active">
                  <option value="true">Enable</option>
                  <option value="false">Revoke</option>
                </select>
              </label>
              <label>
                Reason
                <textarea name="reason" minLength={3} maxLength={1000} required />
              </label>
              <button disabled={busy}>Update role permissions</button>
            </form>
          </details>
        </article>
      )}
    </section>
  );
}
