"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
type User = {
  externalId: string;
  email: string | null;
  mobile: string | null;
  status: string;
  member: { fullName: string; status: string } | null;
  roles: { active: boolean; role: { code: string; name: string } }[];
};
export function AdminUserManagement() {
  const [users, setUsers] = useState<User[]>([]),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/users?${new URLSearchParams({ search, page: String(page) })}`,
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setUsers(result.users);
      setTotal(result.total);
    } catch {
      setMessage("Account records could not be loaded. Check your session and retry.");
    }
  }, [search, page]);
  useEffect(() => {
    void load();
  }, [load]);
  async function change(event: FormEvent<HTMLFormElement>, user: User) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${user.externalId}/roles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roleCode: form.get("role"),
          active: form.get("active") === "true",
          reason: form.get("reason"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Role decision denied");
      setMessage(
        "Role decision recorded. Revocations apply immediately; Coordinator revocation also suspends the profile and reassigns members.",
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Role update could not be completed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article>
      <h2>Account roles & access</h2>
      <p>
        Includes administrative identities without a Member profile. Granting Admin access permits
        sensitive Foundation operations. Every change requires a written reason; you cannot remove
        your own Admin role or the last active Admin.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(String(new FormData(event.currentTarget).get("search") ?? ""));
          setPage(1);
        }}
      >
        <label>
          Find an account
          <input name="search" placeholder="Name, email, mobile or account UUID" />
        </label>
        <button disabled={busy}>Search accounts</button>
      </form>
      {message && <p role="status">{message}</p>}
      {users.map((user) => (
        <details key={user.externalId}>
          <summary>
            {user.member?.fullName ?? user.email ?? "Foundation identity"} · {user.status}
          </summary>
          <p>
            {user.email} · {user.mobile}
          </p>
          <p>
            Account: <code>{user.externalId}</code>
          </p>
          <p>
            {user.roles
              .map((row) => `${row.role.code}: ${row.active ? "enabled" : "disabled"}`)
              .join(" · ") || "No assigned roles"}
          </p>
          <form onSubmit={(event) => void change(event, user)}>
            <label>
              Role
              <select name="role">
                <option>MEMBER</option>
                <option>COORDINATOR</option>
                <option>ADMIN</option>
              </select>
            </label>
            <label>
              Decision
              <select name="active">
                <option value="true">Enable role</option>
                <option value="false">Revoke role</option>
              </select>
            </label>
            <label>
              Mandatory decision reason
              <textarea name="reason" required minLength={3} maxLength={1000} />
            </label>
            <button disabled={busy}>Record role decision</button>
          </form>
        </details>
      ))}
      {!users.length && <p>No matching accounts.</p>}
      <p>
        {total} accounts · Page {page}
      </p>
      <button disabled={busy || page === 1} onClick={() => setPage((value) => value - 1)}>
        Previous accounts
      </button>
      <button disabled={busy || page * 30 >= total} onClick={() => setPage((value) => value + 1)}>
        Next accounts
      </button>
    </article>
  );
}
