"use client";
import Link from "next/link";
import { useState } from "react";

export function CommunityRulesConsent() {
  return (
    <label className="checkbox-label">
      <input type="checkbox" required name="communityRules" /> I agree to the{" "}
      <Link href="/community-rules" target="_blank">
        community rules
      </Link>
      : no abuse, threats, hateful, sexual or graphic content, scams, or private personal
      information.
    </label>
  );
}
export function CommentSafety({
  kind,
  parentExternalId,
  commentExternalId,
  onBlocked,
}: {
  kind: "NEWS_COMMENT" | "EVENT_COMMENT";
  parentExternalId: string;
  commentExternalId: string;
  onBlocked: () => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [signIn, setSignIn] = useState(false);
  async function act(action: "REPORT" | "BLOCK") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/member/content-safety", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          target: {
            kind,
            parentExternalId,
            commentExternalId,
            ...(action === "REPORT" ? { reason } : {}),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setSignIn(response.status === 401);
        throw new Error(data.error ?? "Action could not be completed");
      }
      setMessage(
        action === "REPORT"
          ? "Report sent privately to Foundation Admin for review."
          : "Author blocked. Their comments are hidden while you are signed in.",
      );
      setReporting(false);
      if (action === "BLOCK") onBlocked();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="comment-safety">
      <div className="button-row">
        <button type="button" disabled={busy} onClick={() => setReporting(!reporting)}>
          Report comment
        </button>
        <button type="button" disabled={busy} onClick={() => void act("BLOCK")}>
          Block author
        </button>
      </div>
      {reporting && (
        <div>
          <label>
            Why are you reporting this comment?
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
              maxLength={1000}
            />
          </label>
          <button
            type="button"
            disabled={busy || reason.trim().length < 3}
            onClick={() => void act("REPORT")}
          >
            Send report
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {signIn && <Link href="/login">Sign in to report or block</Link>}
    </div>
  );
}
export function BlockedAuthors() {
  const [blocks, setBlocks] = useState<{ externalId: string; name: string }[] | null>(null);
  const [message, setMessage] = useState("");
  async function load() {
    try {
      const r = await fetch("/api/member/content-safety");
      const d = await r.json();
      if (!r.ok) throw Error(d.error ?? "Unavailable");
      setBlocks(d.blocks);
    } catch {
      setMessage("Blocked authors could not be loaded. Try again.");
    }
  }
  async function unblock(externalId: string) {
    try {
      const r = await fetch("/api/member/content-safety", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ externalId }),
      });
      if (!r.ok) throw Error();
      await load();
      setMessage("Author unblocked. Reload comments to see their messages.");
    } catch {
      setMessage("Author could not be unblocked. Try again.");
    }
  }
  return (
    <details>
      <summary onClick={() => void load()}>Manage blocked authors</summary>
      {blocks?.length === 0 && <p>No authors blocked.</p>}
      {blocks?.map((b) => (
        <p key={b.externalId}>
          {b.name}{" "}
          <button type="button" onClick={() => void unblock(b.externalId)}>
            Unblock
          </button>
        </p>
      ))}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
