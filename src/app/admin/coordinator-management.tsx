"use client";

import { useEffect, useState } from "react";

type Coordinator = {
  externalId: string;
  referralCode: string;
  status: "ACTIVE" | "SUSPENDED";
  isSuspended: boolean;
  suspendedAt: string | null;
  member: { externalId: string; fullName: string };
  _count: { assignedMembers: number };
};
type CoordinatorDetail = Coordinator & {
  assignedMembers: { externalId: string; fullName: string; status: string }[];
  lifecycleEvents: { action: string; reason: string; createdAt: string }[];
  transfers: {
    effectiveAt: string;
    reason: string;
    member: { fullName: string; externalId: string };
  }[];
  cashCollections: {
    externalId: string;
    receiptNumber: string;
    amountPaise: number;
    status: string;
  }[];
};

export function AdminCoordinatorManagement() {
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [modes, setModes] = useState<Record<string, "FOUNDATION_ADMIN" | "TRANSFER">>({});
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [returnMembers, setReturnMembers] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");
  const [detail, setDetail] = useState<CoordinatorDetail | null>(null);
  const openDetail = async (externalId: string) => {
    try {
      const response = await fetch(`/api/admin/coordinators/${externalId}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "History unavailable");
      setDetail(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "History unavailable");
    }
  };

  const load = async () => {
    const response = await fetch("/api/admin/coordinators");
    const data = (await response.json()) as { coordinators?: Coordinator[]; error?: string };
    if (response.ok) setCoordinators(data.coordinators ?? []);
    else setMessage(data.error ?? "Coordinator records are unavailable");
  };
  useEffect(() => {
    void load();
  }, []);

  const suspend = async (coordinator: Coordinator) => {
    const reason = (reasons[coordinator.externalId] ?? "").trim();
    const mode = modes[coordinator.externalId] ?? "FOUNDATION_ADMIN";
    const replacementCoordinatorId = replacements[coordinator.externalId];
    if (reason.length < 3) {
      setMessage("A suspension reason of at least three characters is required.");
      return;
    }
    if (mode === "TRANSFER" && !replacementCoordinatorId) {
      setMessage("Choose an active replacement Coordinator before transferring members.");
      return;
    }
    setWorking(`suspend:${coordinator.externalId}`);
    try {
      const response = await fetch(
        `/api/admin/coordinators/${encodeURIComponent(coordinator.externalId)}/suspend`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reason,
            mode,
            ...(replacementCoordinatorId ? { replacementCoordinatorId } : {}),
          }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Coordinator could not be suspended");
      setMessage("Coordinator suspension and member reassignment were audit-recorded.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Coordinator could not be suspended");
    } finally {
      setWorking("");
    }
  };

  const restore = async (coordinator: Coordinator) => {
    const reason = (reasons[coordinator.externalId] ?? "").trim();
    if (reason.length < 3) {
      setMessage("A restoration reason of at least three characters is required.");
      return;
    }
    setWorking(`restore:${coordinator.externalId}`);
    try {
      const response = await fetch(
        `/api/admin/coordinators/${encodeURIComponent(coordinator.externalId)}/restore`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reason,
            returnTemporarilyManagedMembers: Boolean(returnMembers[coordinator.externalId]),
          }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Coordinator could not be restored");
      setMessage("Coordinator restoration was audit-recorded.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Coordinator could not be restored");
    } finally {
      setWorking("");
    }
  };

  return (
    <section>
      <h2>Coordinator management</h2>
      <p>
        Suspension immediately removes Coordinator permissions and records member reassignment
        history.
      </p>
      {message && <p role="status">{message}</p>}
      {detail && (
        <article>
          <h3>{detail.member.fullName}: activity and history</h3>
          <button onClick={() => setDetail(null)}>Close history</button>
          <h4>Assigned members</h4>
          {detail.assignedMembers.map((member) => (
            <p key={member.externalId}>
              {member.fullName} · {member.status}
            </p>
          ))}
          <h4>Role history</h4>
          {detail.lifecycleEvents.map((event, index) => (
            <p key={index}>
              {new Date(event.createdAt).toLocaleString("en-IN")} · {event.action} · {event.reason}
            </p>
          ))}
          <h4>Transfer history</h4>
          {detail.transfers.map((transfer, index) => (
            <p key={index}>
              {transfer.member.fullName} · {new Date(transfer.effectiveAt).toLocaleString("en-IN")}{" "}
              · {transfer.reason}
            </p>
          ))}
          <h4>Cash collections</h4>
          {detail.cashCollections.map((collection) => (
            <p key={collection.externalId}>
              {collection.receiptNumber} ·{" "}
              {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
                collection.amountPaise / 100,
              )}{" "}
              · {collection.status}
            </p>
          ))}
          <a href="#cash">Open cash reconciliation</a>
          <p>
            Permanent referral code: <code>{detail.referralCode}</code>. It is usable while this
            Coordinator is active; suspension deactivates it immediately.
          </p>
        </article>
      )}
      {coordinators.map((coordinator) => {
        const mode = modes[coordinator.externalId] ?? "FOUNDATION_ADMIN";
        return (
          <article key={coordinator.externalId}>
            <h3>{coordinator.member.fullName}</h3>
            <button onClick={() => void openDetail(coordinator.externalId)}>
              View history and cash activity
            </button>
            <p>
              Referral code: <code>{coordinator.referralCode}</code> · Status:{" "}
              <strong>{coordinator.status}</strong> · Assigned members:{" "}
              {coordinator._count.assignedMembers}
            </p>
            <label htmlFor={`coordinator-reason-${coordinator.externalId}`}>Admin reason</label>
            <textarea
              id={`coordinator-reason-${coordinator.externalId}`}
              maxLength={1000}
              value={reasons[coordinator.externalId] ?? ""}
              onChange={(event) =>
                setReasons((current) => ({
                  ...current,
                  [coordinator.externalId]: event.target.value,
                }))
              }
            />
            {coordinator.status === "ACTIVE" ? (
              <>
                <label htmlFor={`coordinator-mode-${coordinator.externalId}`}>
                  Member coverage while suspended
                </label>
                <select
                  id={`coordinator-mode-${coordinator.externalId}`}
                  value={mode}
                  onChange={(event) =>
                    setModes((current) => ({
                      ...current,
                      [coordinator.externalId]: event.target.value as
                        "FOUNDATION_ADMIN" | "TRANSFER",
                    }))
                  }
                >
                  <option value="FOUNDATION_ADMIN">
                    Foundation Admin temporarily manages members
                  </option>
                  <option value="TRANSFER">Transfer members to another Coordinator</option>
                </select>
                {mode === "TRANSFER" && (
                  <select
                    aria-label={`Replacement Coordinator for ${coordinator.member.fullName}`}
                    value={replacements[coordinator.externalId] ?? ""}
                    onChange={(event) =>
                      setReplacements((current) => ({
                        ...current,
                        [coordinator.externalId]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Choose active replacement</option>
                    {coordinators
                      .filter(
                        (candidate) =>
                          candidate.status === "ACTIVE" &&
                          candidate.externalId !== coordinator.externalId,
                      )
                      .map((candidate) => (
                        <option key={candidate.externalId} value={candidate.externalId}>
                          {candidate.member.fullName} ({candidate.referralCode})
                        </option>
                      ))}
                  </select>
                )}
                <p>
                  <button
                    disabled={working === `suspend:${coordinator.externalId}`}
                    onClick={() => void suspend(coordinator)}
                  >
                    Suspend Coordinator
                  </button>
                </p>
              </>
            ) : (
              <>
                <label>
                  <input
                    checked={Boolean(returnMembers[coordinator.externalId])}
                    type="checkbox"
                    onChange={(event) =>
                      setReturnMembers((current) => ({
                        ...current,
                        [coordinator.externalId]: event.target.checked,
                      }))
                    }
                  />{" "}
                  Return members who are still under temporary Foundation Admin management
                </label>
                <p>
                  <button
                    disabled={working === `restore:${coordinator.externalId}`}
                    onClick={() => void restore(coordinator)}
                  >
                    Restore Coordinator
                  </button>
                </p>
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}
