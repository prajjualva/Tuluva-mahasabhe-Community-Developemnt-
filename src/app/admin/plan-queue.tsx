"use client";
import { useEffect, useState } from "react";

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
  const load = async () => {
    const [plansResponse, duesResponse] = await Promise.all([
      fetch("/api/admin/plans"),
      fetch("/api/admin/plan-dues"),
    ]);
    if (plansResponse.ok) setPlans(await plansResponse.json());
    else setMessage("Sign in as an Administrator to review this queue.");
    if (duesResponse.ok) setDues(await duesResponse.json());
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
        ? "Plan approved. The six-month waiting period has been recorded."
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
        <p>{message}</p>
        {plans.length ? (
          plans.map((plan) => (
            <div key={plan.externalId}>
              <strong>{plan.member.fullName}</strong>
              <p>Submitted {new Date(plan.createdAt).toLocaleDateString()}</p>
              <p>
                Member ID: <code>{plan.member.externalId}</code>
              </p>
              <button onClick={() => approve(plan)}>
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
        {dues.length ? (
          dues.map((due) => (
            <div key={due.externalId}>
              <strong>{due.member.fullName}</strong>
              <p>Current deadline {new Date(due.dueAt).toLocaleDateString()}</p>
              <p>
                Member ID: <code>{due.member.externalId}</code>
              </p>
              <button onClick={() => extend(due.externalId)}>Extend with reason</button>
              {(due.status === "PENDING" || due.status === "OVERDUE") && (
                <button onClick={() => approveCash(due.externalId)}>
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
