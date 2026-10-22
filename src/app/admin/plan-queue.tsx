"use client";
import { useEffect, useRef, useState } from "react";
import { readRecord } from "../components/read-record";

type Plan = {
  externalId: string;
  status: string;
  createdAt: string;
  member: { externalId: string; fullName: string };
};
type PlanDue = {
  externalId: string;
  dueAt: string;
  status: string;
  member: { externalId: string; fullName: string };
};

export function AdminPlanQueue() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [dues, setDues] = useState<PlanDue[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const run = async (operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await operation();
    } catch {
      setMessage("This change could not be confirmed. Refresh the queue before retrying.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const load = async () => {
    setLoading(true);
    const [plansResponse, duesResponse] = await Promise.all([
      readRecord<Plan[]>("/api/admin/plans"),
      readRecord<PlanDue[]>("/api/admin/plan-dues"),
    ]);
    setPlans(plansResponse.ok ? plansResponse.data : []);
    setDues(duesResponse.ok ? duesResponse.data : []);
    setUnavailable(!plansResponse.ok || !duesResponse.ok);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const approve = async (plan: Plan) => {
    const coverage = plan.status === "PENDING_COORDINATOR_APPROVAL";
    const reason = coverage
      ? window.prompt("Reason for Admin acting as temporary Coordinator")
      : undefined;
    if (coverage && !reason) return;
    const response = await fetch(`/api/admin/plans/${plan.externalId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stage: coverage ? "COORDINATOR" : "ADMIN",
        ...(reason ? { reason } : {}),
      }),
    });
    setMessage(
      response.ok
        ? coverage
          ? "Coordinator-stage review recorded. Final Admin approval is still required."
          : "Final plan approval recorded. The initial waiting period is available in the plan history."
        : "Approval was denied.",
    );
    await load();
  };
  const extend = async (externalId: string) => {
    const dueAt = window.prompt("New deadline (YYYY-MM-DD)");
    const reason = window.prompt("Reason for extension (recorded in audit log)");
    if (!dueAt || !reason) return;
    const response = await fetch(`/api/admin/plan-dues/${externalId}/extend`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dueAt, reason }),
    });
    setMessage(
      response.ok
        ? "Deadline extension recorded with your identity, time, and reason."
        : "Extension was denied.",
    );
    await load();
  };
  const approveCash = async (externalId: string) => {
    const reason = window.prompt(
      "Reason for allowing this ₹1,000 Coordinator cash/manual collection",
    );
    if (!reason?.trim()) return;
    try {
      const response = await fetch(`/api/admin/plan-dues/${externalId}/approve-cash`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      setMessage(
        response.ok
          ? "Special cash collection approval recorded."
          : "Cash collection approval was denied.",
      );
    } catch {
      setMessage("Could not connect. Please try again.");
    }
  };
  return (
    <>
      <article>
        <h2>Community Support Plan approvals</h2>
        <p role="status">{message}</p>
        {unavailable && (
          <p role="status">
            Some plan records are unavailable.{" "}
            <button disabled={loading || busy} onClick={() => void load()}>
              Retry loading plans
            </button>
          </p>
        )}
        {loading ? (
          <p>Loading plan approvals…</p>
        ) : unavailable ? null : plans.length ? (
          plans.map((plan) => (
            <div key={plan.externalId}>
              <strong>{plan.member.fullName}</strong>
              <p>Submitted {new Date(plan.createdAt).toLocaleDateString()}</p>
              <p>
                Member ID: <code>{plan.member.externalId}</code>
              </p>
              <button disabled={busy} onClick={() => void run(() => approve(plan))}>
                {plan.status === "PENDING_COORDINATOR_APPROVAL"
                  ? "Approve under temporary Admin coverage"
                  : "Approve plan"}
              </button>
            </div>
          ))
        ) : (
          <p>No plans awaiting Admin approval.</p>
        )}
      </article>
      <article>
        <h2>Registration deadline extensions</h2>
        {loading ? (
          <p>Loading registration deadlines…</p>
        ) : unavailable ? null : dues.length ? (
          dues.map((due) => (
            <div key={due.externalId}>
              <strong>{due.member.fullName}</strong>
              <p>Current deadline {new Date(due.dueAt).toLocaleDateString()}</p>
              <p>
                Member ID: <code>{due.member.externalId}</code>
              </p>
              <button disabled={busy} onClick={() => void run(() => extend(due.externalId))}>
                Extend with reason
              </button>
              {(due.status === "PENDING" || due.status === "OVERDUE") && (
                <button disabled={busy} onClick={() => void run(() => approveCash(due.externalId))}>
                  Allow Coordinator cash collection
                </button>
              )}
            </div>
          ))
        ) : (
          <p>No open registration deadlines.</p>
        )}
      </article>
    </>
  );
}
