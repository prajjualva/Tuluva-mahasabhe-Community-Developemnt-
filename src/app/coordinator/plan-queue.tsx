"use client";
import { useEffect, useRef, useState } from "react";
import { readRecord } from "../components/read-record";

type Plan = {
  externalId: string;
  createdAt: string;
  member: { externalId: string; fullName: string };
};
export function CoordinatorPlanQueue() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = async () => {
    setLoading(true);
    const response = await readRecord<Plan[]>("/api/coordinator/plans");
    setUnavailable(!response.ok);
    setPlans(response.ok ? response.data : []);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const approve = async (externalId: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/coordinator/plans/${externalId}/approve`, {
        method: "POST",
      });
      setMessage(
        response.ok ? "Plan sent to the Administrator for final approval." : "Approval was denied.",
      );
      await load();
    } catch {
      setMessage("Approval could not be confirmed. Refresh the queue before retrying.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <article>
      <h2>Assigned plan approvals</h2>
      <p role="status">{message}</p>
      {unavailable && (
        <p role="status">
          The approval queue is unavailable.{" "}
          <button disabled={loading || busy} onClick={() => void load()}>
            Retry loading plans
          </button>
        </p>
      )}
      {loading ? (
        <p>Loading assigned plans…</p>
      ) : unavailable ? null : plans.length ? (
        plans.map((plan) => (
          <div key={plan.externalId}>
            <strong>{plan.member.fullName}</strong>
            <p>Submitted {new Date(plan.createdAt).toLocaleDateString()}</p>
            <button disabled={busy} onClick={() => void approve(plan.externalId)}>
              Approve and send to Admin
            </button>
          </div>
        ))
      ) : (
        <p>No assigned plans awaiting approval.</p>
      )}
    </article>
  );
}
