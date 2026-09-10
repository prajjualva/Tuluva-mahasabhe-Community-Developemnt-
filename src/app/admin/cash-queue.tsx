"use client";
import { useEffect, useState } from "react";

type Collection = {
  externalId: string;
  amountPaise: number;
  method: "CASH" | "MANUAL";
  receiptNumber: string;
  member: { externalId: string; fullName: string };
};
export function AdminCashQueue() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [message, setMessage] = useState("");
  const load = async () => {
    const response = await fetch("/api/admin/cash");
    if (response.ok) setCollections(await response.json());
  };
  useEffect(() => {
    void load();
  }, []);
  const verify = async (externalId: string, approved: boolean) => {
    const reason = approved
      ? undefined
      : (window.prompt("Rejection reason (recorded in audit log)") ?? undefined);
    if (!approved && !reason) return;
    const response = await fetch(`/api/admin/cash/${externalId}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approved, reason }),
    });
    setMessage(
      response.ok
        ? approved
          ? "Coordinator payment verified and official receipt issued."
          : "Coordinator payment rejected and audit recorded."
        : "Payment verification was denied.",
    );
    await load();
  };
  return (
    <article>
      <h2>Coordinator payment verification</h2>
      <p>{message}</p>
      {collections.length ? (
        collections.map((collection) => (
          <div key={collection.externalId}>
            <strong>{collection.member.fullName}</strong>
            <p>
              {collection.method} · {collection.receiptNumber} · ₹
              {(collection.amountPaise / 100).toFixed(2)}
            </p>
            <button onClick={() => verify(collection.externalId, true)}>Verify payment</button>
            <button onClick={() => verify(collection.externalId, false)}>Reject</button>
          </div>
        ))
      ) : (
        <p>No cash collections await verification.</p>
      )}
    </article>
  );
}
