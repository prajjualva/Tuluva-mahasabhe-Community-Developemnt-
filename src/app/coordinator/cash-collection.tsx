"use client";
import { useEffect, useState } from "react";

type Due = {
  externalId: string;
  purpose: string;
  amountPaise: number;
  dueAt: string;
  status: string;
};
type Member = { externalId: string; fullName: string; status: string; dues: Due[] };
const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

export function CoordinatorCashCollection() {
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  const load = async () => {
    const response = await fetch("/api/coordinator/members");
    if (response.ok) setMembers(await response.json());
    else setMessage("Sign in as an active Coordinator to view assigned members.");
  };
  useEffect(() => {
    void load();
  }, []);
  const recordCash = async (member: Member, due: Due) => {
    const response = await fetch("/api/coordinator/cash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        memberExternalId: member.externalId,
        dueExternalId: due.externalId,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    setMessage(
      response.ok
        ? "Cash collection recorded. It now awaits Administrator verification."
        : "Could not record cash collection.",
    );
    await load();
  };
  return (
    <article>
      <h2>Assigned-member cash collections</h2>
      <p>{message}</p>
      {members.length ? (
        members.map((member) => (
          <section key={member.externalId}>
            <strong>{member.fullName}</strong>
            <p>{member.status}</p>
            {member.dues.length ? (
              member.dues.map((due) => (
                <div key={due.externalId}>
                  {due.purpose} · {rupees(due.amountPaise)}{" "}
                  <button onClick={() => recordCash(member, due)}>Record cash received</button>
                </div>
              ))
            ) : (
              <p>No unpaid dues.</p>
            )}
          </section>
        ))
      ) : (
        <p>No assigned members found.</p>
      )}
    </article>
  );
}
