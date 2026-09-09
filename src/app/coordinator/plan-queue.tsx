"use client";
import { useEffect, useState } from "react";

type Plan = {
  externalId: string;
  createdAt: string;
  member: { externalId: string; fullName: string };
};
export function CoordinatorPlanQueue() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [message, setMessage] = useState("");
  const load = async () => {
    const response = await fetch("/api/coordinator/plans");
    if (response.ok) setPlans(await response.json());
    else setMessage("Sign in as an active Coordinator to review assigned plans.");
  };
  useEffect(() => {
    void load();
  }, []);
  const approve = async (externalId: string) => {
    const response = await fetch(`/api/coordinator/plans/${externalId}/approve`, {
      method: "POST",
    });
    setMessage(
      response.ok ? "Plan sent to the Administrator for final approval." : "Approval was denied.",
    );
    await load();
  };
  return (
    <article>
      <h2>Assigned plan approvals</h2>
      <p>{message}</p>
      {plans.length ? (
        plans.map((plan) => (
          <div key={plan.externalId}>
            <strong>{plan.member.fullName}</strong>
            <p>Submitted {new Date(plan.createdAt).toLocaleDateString()}</p>
            <button onClick={() => approve(plan.externalId)}>Approve and send to Admin</button>
          </div>
        ))
      ) : (
        <p>No assigned plans awaiting approval.</p>
      )}
    </article>
  );
}
