"use client";
import { useCallback, useEffect, useState } from "react";
type Overview = {
  totalMembers: number;
  members: Record<string, number>;
  coordinators: Record<string, number>;
  generatedAt: string;
  tasks: Record<string, number>;
};
const tasks: [string, string, string][] = [
  ["planApprovals", "Plan approvals", "plans"],
  ["nomineeVerification", "Nominee verification", "nominees"],
  ["deathReports", "Death reports", "death-reports"],
  ["deathSupportEvents", "Death Support Events", "death-reports"],
  ["pendingContributions", "Pending contributions", "members"],
  ["failedPayments", "Failed payments", "payments"],
  ["cashVerification", "Cash verification", "cash"],
  ["discrepancies", "Unresolved cash discrepancies", "cash"],
  ["supportPayments", "Support payment reviews", "support"],
  ["walletActivity", "Wallet movements", "wallet"],
  ["ledgerEntries", "Ledger entries", "ledger"],
  ["auditActivity", "Audit records", "audit"],
  ["newsApprovals", "News approvals", "news"],
];
export function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/dashboard");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Dashboard unavailable");
      setData(body);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dashboard unavailable");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section aria-label="Foundation operations summary">
      <p role="status">
        {message ||
          (!data
            ? "Loading Foundation activity…"
            : `Updated ${new Date(data.generatedAt).toLocaleString("en-IN")}`)}
      </p>
      <button onClick={() => void load()}>Refresh dashboard</button>
      {data && (
        <>
          <div className="grid">
            <article>
              <p>Total members</p>
              <strong>{data.totalMembers}</strong>
            </article>
            {["ACTIVE", "GRACE", "INACTIVE", "CLOSED", "DECEASED"].map((status) => (
              <article key={status}>
                <p>{status} members</p>
                <strong>{data.members[status] ?? 0}</strong>
              </article>
            ))}
            <article>
              <p>Active Coordinators</p>
              <strong>{data.coordinators.ACTIVE ?? 0}</strong>
            </article>
            <article>
              <p>Suspended Coordinators</p>
              <strong>{data.coordinators.SUSPENDED ?? 0}</strong>
            </article>
          </div>
          <h2>Admin tasks and activity</h2>
          <div className="grid">
            {tasks.map(([key, label, target]) => (
              <article key={key}>
                <a href={`#${target}`}>{label}</a>
                <p>
                  <strong>{data.tasks[key] ?? 0}</strong>
                </p>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
